var socket;
var bodies = {};
var nextBodies = {};
var lastUpdateTime;
var nextUpdateTime;
var startServerTime = 0;
var startClientTime = 0;
var serverTimeOffset = 0;
var lastUpdateServerTime = 0;
var nextUpdateServerTime = 0;
var roomInfo;
var roomID;
var bodyMeshes = {};
var nameTags = {};
var availableEnvironments = [];
var availableRooms = [];
var material_count = 0;

const connectToRoboScapeSim = function () {
    return new Promise((resolve, reject) => {
        if (socket != undefined) {
            console.log("Existing socket");
            return resolve(socket);
        }

        console.log("Created new socket");

        if (window.origin.includes('localhost')) {
            socket = io('//localhost:9001', { secure: true, withCredentials: false });
        } else {
            socket = io('//3-222-232-255.nip.io', { secure: true, withCredentials: false });
        }

        socket.on('connect', e => {

            // Tell server who we are
            socket.emit('getRooms', SnapCloud.username || SnapCloud.clientId);

            // Handle incremental updates
            socket.on('u', data => {
                if (performance.now() - nextUpdateTime > 10) {
                    bodies = { ...nextBodies };
                    nextBodies = { ...bodies, ...data };
                    lastUpdateTime = nextUpdateTime;
                    nextUpdateTime = performance.now();
                    lastUpdateServerTime = nextUpdateServerTime;
                    nextUpdateServerTime = data.time * 1000;
                }
            });

            // Handle full updates
            socket.on('fullUpdate', data => {
                bodiesInfo = { ...data };

                if (Object.keys(bodies).length == 0 || Object.keys(nextBodies).length == 0) {
                    bodies = { ...data };
                    nextBodies = { ...data };
                    lastUpdateTime = lastUpdateTime || performance.now() - 50;
                    nextUpdateTime = performance.now();
                    lastUpdateServerTime = data.time * 1000;
                    nextUpdateServerTime = data.time * 1000;
                    startClientTime = nextUpdateTime;
                    startServerTime = data.time * 1000;
                    serverTimeOffset = startClientTime - startServerTime;
                }


                // Create entries in dropdown
                window.externalVariables.roboscapeSimCanvasInstance.robotsList.choices =
                    Object.keys(bodiesInfo).filter(label => label.startsWith('robot'))
                        .reduce((prev, info) => {
                            prev[info.replace('robot_', '')] = info.replace('robot_', '');
                            return prev;
                        }, {});

                // Validate choice (if selected robot no longer exists, reset dropdown choice)
                if (!(window.externalVariables.roboscapeSimCanvasInstance.robotsList.getValue() in window.externalVariables.roboscapeSimCanvasInstance.robotsList.choices)) {
                    window.externalVariables.roboscapeSimCanvasInstance.robotsList.setChoice('');
                }
            });

            // Handle room info
            socket.on('roomInfo', info => {
                roomInfo = info;

                if (info.background != '') {
                    roomBG.src = `/img/backgrounds/${info.background}.png`;
                }

                startServerTime = info.time * 1000;
                startClientTime = performance.now();
                serverTimeOffset = startClientTime - startServerTime;
            });

            var lastError = {};

            socket.on('error', error => {
                console.error(error);
                if (error.message != lastError.message) {
                    world.inform(error);
                    lastError = error;
                }
            });

            socket.on('connect_error', error => {
                console.error(error);
                if (error.message != lastError.message) {
                    world.inform(error);
                    lastError = error;
                }
            });

            socket.on('reconnect_error', error => {
                console.error(error);
            });

            // If we were previously connected, let server know we had an issue
            socket.on('reconnect', attempt => {
                console.log(`Reconnected after ${attempt} attempts!`);
                //socket.emit('postReconnect', roomID);
                joinRoom(roomID);
            });

            // Room joined message
            socket.on('roomJoined', result => {
                if (result !== false) {
                    world.inform(`Joined room ${result}`);
                    roomID = result;

                    // Start running
                    updateCanvasTitle(result);

                } else {
                    // Failed to join room
                    world.inform('Failed to join room');
                }
            });

            // Update list of available environments
            socket.on('availableEnvironments', list => {
                availableEnvironments = list;

                setTimeout(() => {
                    resolve(socket);
                }, 50);
            });

            // Update list of quick-join rooms
            socket.on('availableRooms', info => {
                ({ availableRooms } = info);
                availableRooms = availableRooms.sort((room1, room2) => Date.parse(room2.lastInteractionTime) - Date.parse(room1.lastInteractionTime));
            });

            // Robot beeped
            socket.on('beep', args => {
                beepData = args[0];
                console.log(`beep ${beepData.Robot} ${beepData.Frequency} hz, ${beepData.Duration} ms `);
                playNote(beepData.Robot, beepData.Frequency, beepData.Duration);
            });

            // Kicked from room
            socket.on('roomLeft', args => {
                leaveRoom();
            });

            // Show message
            socket.on('showText', args => {
                text = args[0];
                id = args[1];
                timeout = args[2];

                addOrUpdateText(text, id, timeout);
            });

        });

        // Lost connection
        socket.on('disconnect', () => {
            updateCanvasTitle('Not connected');
        });

        setTimeout(reject, 3500);
    });
};


function updateCanvasTitle(result) {
    window.externalVariables.roboscapeSimCanvasInstance.labelString = result;
    window.externalVariables.roboscapeSimCanvasInstance.label.text = result;

    // Hack to update label text without causing fixLayout to change the dialog size
    let th = fontHeight(window.externalVariables.roboscapeSimCanvasInstance.titleFontSize) + window.externalVariables.roboscapeSimCanvasInstance.titlePadding * 2;
    window.externalVariables.roboscapeSimCanvasInstance.label.measureCtx.font = window.externalVariables.roboscapeSimCanvasInstance.label.font();
    let width = Math.max(
        window.externalVariables.roboscapeSimCanvasInstance.label.measureCtx.measureText(result).width + Math.abs(window.externalVariables.roboscapeSimCanvasInstance.label.shadowOffset.x),
        1
    );

    // Set label to be wide enough
    window.externalVariables.roboscapeSimCanvasInstance.label.bounds.setWidth(width);
    window.externalVariables.roboscapeSimCanvasInstance.label.fixLayout(true);

    // Fix label position
    window.externalVariables.roboscapeSimCanvasInstance.label.setCenter(window.externalVariables.roboscapeSimCanvasInstance.center());
    window.externalVariables.roboscapeSimCanvasInstance.label.setTop(window.externalVariables.roboscapeSimCanvasInstance.top() + (th - window.externalVariables.roboscapeSimCanvasInstance.label.height()) / 2);
    window.externalVariables.roboscapeSimCanvasInstance.label.fixLayout(true);
    window.externalVariables.roboscapeSimCanvasInstance.rerender();
}

function newRoom(environment = 'default', password = '') {
    joinRoom('create', environment, password);
}

/**
 * Send message to join a room
 * @param {string} room
 * @param {string} env
 */
function joinRoom(room, env = '', password = '') {
    // Prevent joining a second room
    if (roomID != null && room != roomID) {
        leaveRoom();
    }

    socket.emit('joinRoom', { roomID: room, env, password, namespace: SnapCloud.username || SnapCloud.clientId });
}

/**
  * Leave current room and clean up contents
  */
function leaveRoom() {
    if (roomID == null) {
        console.warn('Not in a room to leave');
    }

    // Reset data
    bodies = {};
    nextBodies = {};
    roomInfo = null;
    roomID = null;

    // Clean up meshes
    for (let mesh of Object.values(bodyMeshes)) {
        mesh?.dispose();
    }
    bodyMeshes = {};

    updateCanvasTitle('Not connected');

    // Reset camera
    scene.activeCamera = camera;
    camera.position = new BABYLON.Vector3(4, 10, -4);
    camera.setTarget(new BABYLON.Vector3(0, 0, 0));
    clearAllTextBlocks();
}

// Load socket.io
var script = document.createElement('script');
script.type = 'text/javascript';
script.src = 'https://cdn.socket.io/4.4.1/socket.io.min.js';
document.body.appendChild(script);

var interpolate = function (x1, x2, dx1, dx2, t1, t2, t) {
    if (Math.abs(x1 - x2) < 0.005) {
        return (t < t2) ? +x1 : +x2;
    }

    t = (t - t2) / Math.max(4, t2 - t1);
    return BABYLON.Scalar.Lerp(+x1, +x2, t);
};

var interpolateRotation = function (q1, q2, dq1, dq2, t1, t2, t) {
    if(q1.equalsWithEpsilon(q2, 0.01)){
        return q1.normalize();
    }

    t = (t - t2) / Math.max(10, t2 - t1);
    return BABYLON.Quaternion.Slerp(q1, q2, t).normalize();
};

/**
 * Converts a color hex string to an RGB color object
 * @param {String} hexstring Input hex string (e.g. '#FFFFFF'), beginning # is optional
 * @returns {{r: Number, g: Number, b: Number}} 
 */
var hex2rgb = function (hexstring) {
    if (hexstring[0] != '#') {
        hexstring = '#' + hexstring;
    }

    if (hexstring.length == 4) {
        r = parseInt(hexstring.charAt(1) + '' + hexstring.charAt(1), 16) / 255;
        g = parseInt(hexstring.charAt(2) + '' + hexstring.charAt(2), 16) / 255;
        b = parseInt(hexstring.charAt(3) + '' + hexstring.charAt(3), 16) / 255;
    }
    else {
        r = parseInt(hexstring.charAt(1) + '' + hexstring.charAt(2), 16) / 255;
        g = parseInt(hexstring.charAt(3) + '' + hexstring.charAt(4), 16) / 255;
        b = parseInt(hexstring.charAt(5) + '' + hexstring.charAt(6), 16) / 255;
    }

    return { r, g, b };
};

setTimeout(() => {
    updateLoopFunctions.push((frameTime) => {

        let tempNextTime = lastUpdateTime + (nextUpdateServerTime - lastUpdateServerTime);

        if (bodies) {
            // Show robots
            for (let label of Object.keys(bodies)) {
                // create if new
                if (!Object.keys(bodyMeshes).includes(label)) {
                    if (Object.keys(bodiesInfo).includes(label)) {

                        if (!bodiesInfo[label].width || !bodiesInfo[label].visualInfo || bodiesInfo[label].visualInfo.modelScale == -1) {
                            continue;
                        }

                        if (bodiesInfo[label].visualInfo.model && bodiesInfo[label].visualInfo.model.endsWith('.gltf')) { // Mesh object
                            bodyMeshes[label] = addMesh(bodiesInfo[label].visualInfo.model).then(result => {
                                bodyMeshes[label] = result;

                                if (label.startsWith('robot_')) {
                                    let tag = createLabel(label.substring(label.length - 4));

                                    // Move to position
                                    tag.billboardMode = BABYLON.TransformNode.BILLBOARDMODE_ALL;
                                    tag.setParent(result);
                                    tag.scaling.x = -0.05;
                                    tag.scaling.y = 0.05;
                                    tag.position.y = -0.2;

                                    nameTags[label] = tag;
                                } else {
                                    if (bodiesInfo[label].visualInfo.modelScale) {
                                        bodyMeshes[label].scaling.x = bodiesInfo[label].visualInfo.modelScale;
                                        bodyMeshes[label].scaling.y = bodiesInfo[label].visualInfo.modelScale;
                                        bodyMeshes[label].scaling.z = bodiesInfo[label].visualInfo.modelScale;
                                    }
                                }
                            });
                        } else {
                            bodyMeshes[label] = addBlock(bodiesInfo[label].width, bodiesInfo[label].height, bodiesInfo[label].depth).then(result => {
                                if (bodiesInfo[label].visualInfo.color && !bodiesInfo[label].visualInfo.image && bodiesInfo[label].visualInfo.color[0] == '#') {
                                    var material = new BABYLON.StandardMaterial('material' + material_count++);

                                    let color = hex2rgb(bodiesInfo[label].visualInfo.color);

                                    material.diffuseColor = new BABYLON.Color3(color.r, color.g, color.b);
                                    material.specularColor.r = 0.5;
                                    material.specularColor.g = 0.5;
                                    material.specularColor.b = 0.5;

                                    result.material = material;

                                } else if (bodiesInfo[label].visualInfo.image && bodiesInfo[label].visualInfo.image.endsWith('.png')) {
                                    var material = new BABYLON.StandardMaterial('material' + material_count++);
                                    material.diffuseTexture = new BABYLON.Texture(assetsDir + bodiesInfo[label].visualInfo.image);
                                    material.diffuseTexture.uScale = bodiesInfo[label].visualInfo.uScale ?? bodiesInfo[label].width;
                                    material.diffuseTexture.vScale = bodiesInfo[label].visualInfo.vScale ?? bodiesInfo[label].height;

                                    material.specularColor.r = 0.5;
                                    material.specularColor.g = 0.5;
                                    material.specularColor.b = 0.5;

                                    if (bodiesInfo[label].visualInfo.color) {
                                        let color = hex2rgb(bodiesInfo[label].visualInfo.color);
                                        material.diffuseColor = new BABYLON.Color3(color.r, color.g, color.b);
                                    }

                                    result.material = material;
                                }

                                bodyMeshes[label] = result;
                            });
                        }
                    }
                } else {
                    // Detect not yet loaded mesh
                    if (typeof bodyMeshes[label].then === 'function') {
                        continue;
                    }

                    // Update position
                    let body = bodies[label];

                    if (!body.pos) {
                        continue;
                    }

                    let { x, y, z } = body.pos;

                    let angle = { ...body.angle };
                    const nextBody = nextBodies[label];

                    if (!nextBody) {
                        continue;
                    }

                    // Extrapolate/Interpolate position and rotation
                    x = interpolate(x, nextBody.pos.x, body.vel.x || 0, nextBody.vel.x || 0, lastUpdateTime, tempNextTime, frameTime);
                    y = interpolate(y, nextBody.pos.y, body.vel.y || 0, nextBody.vel.y || 0, lastUpdateTime, tempNextTime, frameTime);
                    z = interpolate(z, nextBody.pos.z, body.vel.z || 0, nextBody.vel.z || 0, lastUpdateTime, tempNextTime, frameTime);

                    angle = new BABYLON.Quaternion(
                        angle.X, angle.Y, angle.Z, angle.W
                    );

                    let nextAngle = new BABYLON.Quaternion(
                        nextBody.angle.X, nextBody.angle.Y, nextBody.angle.Z, nextBody.angle.W
                    );

                    bodyMeshes[label].position.x = x;
                    bodyMeshes[label].position.y = y;
                    bodyMeshes[label].position.z = z;

                    bodyMeshes[label].rotationQuaternion = interpolateRotation(angle, nextAngle, null, null, lastUpdateTime, tempNextTime, frameTime);
                }
            }
        }
    });

    updateLoopFunctions.push(() => {
        if (firstPersonCam && scene.activeCamera == firstPersonCam) {
            if (firstPersonCam.targetRobot && bodyMeshes['robot_' + firstPersonCam.targetRobot]) {
                let body = bodyMeshes['robot_' + firstPersonCam.targetRobot];
                let offset = new BABYLON.Vector3();

                BABYLON.Vector3.Forward().scale(0.6).rotateByQuaternionToRef(body.rotationQuaternion, offset);
                offset = offset.add(new BABYLON.Vector3(0, 0.05, 0));

                firstPersonCam.position = body.position.add(offset);
                firstPersonCam.rotationQuaternion = body.rotationQuaternion;
            }
        }
    });
}, 200);

// Mapping of robots to currently playing notes (so robots can only play one at a time)
let roboNotes = {};

const playNote = function (robot, frequency, duration) {
    // Stop an already playing note from this robot
    if (roboNotes[robot]) {
        roboNotes[robot].stop();
        delete roboNotes[robot];
    }

    let n = new Note(69);
    n.frequency = frequency;

    let gainNode = n.audioContext.createGain();
    gainNode.gain.value = 0.05;

    n.play(2, gainNode);
    setTimeout(() => { n.stop(); }, duration);
    roboNotes[robot] = n;
};

var socket;
var bodies = {};
var nextBodies = {};
var lastUpdateTime;
var nextUpdateTime;
var roomInfo;
var roomID;
var bodyMeshes = {};

const connectToRoboScapeSim = function(){
    socket = io("//localhost:9001", { secure: true });
    //socket = io("//3-222-232-255.nip.io", { secure: true });
    socket.on('connect', e => {
        

        // Handle incremental updates
        socket.on('update', data => {
            bodies = { ...nextBodies };
            nextBodies = { ...bodies, ...data };
            lastUpdateTime = nextUpdateTime;
            nextUpdateTime = Date.now();
        });

        // Handle full updates
        socket.on('fullUpdate', data => {
            bodiesInfo = data;
            bodies = {...data, ...nextBodies};
            nextBodies = data;
            lastUpdateTime = nextUpdateTime || Date.now() - 50;
            nextUpdateTime = Date.now();
        });

        // Handle room info
        socket.on('roomInfo', info => {
            roomInfo = info;

            if (info.background != '') {
                roomBG.src = `/img/backgrounds/${info.background}.png`;
            }
        });

        socket.on('error', error => {
            console.error(error);
        });

        // If we were previously connected, let server know we had an issue
        socket.on('reconnect', attempt => {
            console.log(`Reconnected after ${attempt} attempts!`);
            socket.emit('postReconnect', roomID);
        });

        // Room joined message
        socket.on('roomJoined', result => {
            if (result !== false) {
                world.inform(`Joined room ${result}`);
                roomID = result;

                // Start running
                window.externalVariables.canvasInstance.labelString = result;
                window.externalVariables.canvasInstance.createLabel();
                window.externalVariables.canvasInstance.rerender();
                window.externalVariables.canvasInstance.fixLayout();
                window.externalVariables.canvasInstance.rerender();
                window.externalVariables.canvasInstance.handle.fixLayout();
                window.externalVariables.canvasInstance.handle.rerender();

            } else {
                // Failed to join room
                world.inform('Failed to join room');
            }
        });
    });
};


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
    if (roomID != null) {
        throw 'Already in room.';
    }

    socket.emit('joinRoom', { roomID: room, env, password, namespace: SnapCloud.username || SnapCloud.clientId });
}

/**
 * Import robot mesh and add it to scene
 * @returns Robot mesh object
 */
const addRobot = async function () {
    let imported = await BABYLON.SceneLoader.ImportMeshAsync('', 'http://localhost:8080/src/', 'parallax_robot.gltf');
    imported.meshes[0].scaling.scaleInPlace(2);
    return imported.meshes[0];
};

// Create update function for robots

// Load geckos
var script = document.createElement('script');
script.type = 'text/javascript';
script.src = 'https://cdn.socket.io/socket.io-2.3.1.slim.js';
document.body.appendChild(script);

var interpolate = function (x1, x2, dx1, dx2, t1, t2, t) {

    if (t - t2 > t2 - t1) return x2;

    t = (t - t2) / Math.max(64, t2 - t1);

    let a = dx2 - dx1;

    dx1 = x2 - x1;

    return x1 + t * dx1 + a / 2.0 * t * t; 
}

var interpolateRotation = function (q1, q2, dq1, dq2, t1, t2, t) {

    t = (t - t2) / Math.max(32, t2 - t1);

    return BABYLON.Quaternion.Slerp(q1, q2, t);

    let a = dx2 - dx1;

    dx1 = x2 - x1;

    return x1 + t * dx1 + a / 2.0 * t * t; 
}

setTimeout(() => {
    updateLoopFunctions.push((frameTime) => {
        if (bodies) {
            // Show robots
            for (let label of Object.keys(bodies)) {
                // create if new
                if (!Object.keys(bodyMeshes).includes(label)) {
                    if(Object.keys(bodiesInfo).includes(label)){
                        if (bodiesInfo[label].image == 'parallax_robot') {
                            bodyMeshes[label] = addRobot().then(result => {
                                //result.setPivotMatrix(BABYLON.Matrix.Translation(0, 1, 0), false);
                                //result.position.y = 0.15;
                                bodyMeshes[label] = result;
                            });
                        } else {
                            bodyMeshes[label] = addBlock(bodiesInfo[label].width, bodiesInfo[label].height, bodiesInfo[label].depth).then(result => {
                                //result.setPivotMatrix(BABYLON.Matrix.Translation(0, 1, 0), false);
                                //result.position.y = 1;

                                
                                if(label == "ground"){
                                    var groundMaterial = new BABYLON.StandardMaterial("groundMaterial");
                                    groundMaterial.diffuseColor = new BABYLON.Color3(0.35, 0.35, 0.35);
                                    result.material = groundMaterial;    
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
                    let { x, y, z } = body.pos;
                    
                    let angle = {...body.angle};
                    const nextBody = nextBodies[label];
                    // Extrapolate/Interpolate position and rotation
                    // x += ((nextBodies[label].pos.x - x) * (frameTime - lastUpdateTime)) / Math.max(1, nextUpdateTime - lastUpdateTime);
                    // y += ((nextBodies[label].pos.y - y) * (frameTime - lastUpdateTime)) / Math.max(1, nextUpdateTime - lastUpdateTime);
                    // z += ((nextBodies[label].pos.z - z) * (frameTime - lastUpdateTime)) / Math.max(1, nextUpdateTime - lastUpdateTime);

                    x = interpolate(x, nextBody.pos.x, body.vel.x || 0, nextBody.vel.x || 0, lastUpdateTime, nextUpdateTime, frameTime);
                    y = interpolate(y, nextBody.pos.y, body.vel.y || 0, nextBody.vel.y || 0, lastUpdateTime, nextUpdateTime, frameTime);
                    z = interpolate(z, nextBody.pos.z, body.vel.z || 0, nextBody.vel.z || 0, lastUpdateTime, nextUpdateTime, frameTime);

                    
                    // angle.x += ((nextBodies[label].angle.x - angle.x) * (frameTime - lastUpdateTime)) / Math.max(1, nextUpdateTime - lastUpdateTime);
                    // angle.y += ((nextBodies[label].angle.y - angle.y) * (frameTime - lastUpdateTime)) / Math.max(1, nextUpdateTime - lastUpdateTime);
                    // angle.z += ((nextBodies[label].angle.z - angle.z) * (frameTime - lastUpdateTime)) / Math.max(1, nextUpdateTime - lastUpdateTime);
                    angle = new BABYLON.Quaternion(
                        angle.X, angle.Y, angle.Z, angle.W
                    );

                    let nextAngle = new BABYLON.Quaternion(
                        nextBody.angle.X, nextBody.angle.Y, nextBody.angle.Z, nextBody.angle.W
                    );

                    bodyMeshes[label].position.x = x;
                    bodyMeshes[label].position.y = y;
                    bodyMeshes[label].position.z = z;

                    bodyMeshes[label].rotationQuaternion = interpolateRotation(angle, nextAngle, null, null, lastUpdateTime, nextUpdateTime, frameTime);
                    // bodyMeshes[label].rotationQuaternion = new BABYLON.Quaternion(
                    //     angle.X, angle.Y, angle.Z, angle.W
                    // );
                }
            }
        }
    });
}, 200);
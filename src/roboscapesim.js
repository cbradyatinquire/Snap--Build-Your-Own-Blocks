
var geckosSocket;
var bodies = {};
var nextBodies = {};
var lastUpdateTime;
var nextUpdateTime;
var roomInfo;
var roomID;
var bodyMeshes = {};

const connectToRoboScapeSim = function(){
    geckosSocket = geckos();
    geckosSocket.onConnect(e => {
        

        // Handle incremental updates
        geckosSocket.on('update', data => {
            bodies = { ...nextBodies };
            nextBodies = { ...bodies, ...data };
            lastUpdateTime = nextUpdateTime;
            nextUpdateTime = Date.now();
        });

        // Handle full updates
        geckosSocket.on('fullUpdate', data => {
            bodiesInfo = data;
            bodies = data;
            nextBodies = data;
            lastUpdateTime = Date.now();
            nextUpdateTime = Date.now();
        });

        // Handle room info
        geckosSocket.on('roomInfo', info => {
            roomInfo = info;

            if (info.background != '') {
                roomBG.src = `/img/backgrounds/${info.background}.png`;
            }
        });

        geckosSocket.on('error', error => {
            console.log(error);
        });

        // If we were previously connected, let server know we had an issue
        geckosSocket.on('reconnect', attempt => {
            console.log(`Reconnected after ${attempt} attempts!`);
            geckosSocket.emit('postReconnect', roomID);
        });

        // Room joined message
        geckosSocket.on('roomJoined', result => {
            if (result !== false) {
                console.log(`Joined room ${result}`);
                roomID = result;

                // Start running

            } else {
                // Failed to join room
                console.log('Failed to join room');
            }
        });
    });
};


function newRoom() {
    joinRoom('create');
}

/**
 * Send message to join a room
 * @param {string} room
 * @param {string} env
 */
function joinRoom(room, env = '') {
    // Prevent joining a second room
    if (roomID != null) {
        throw 'Already in room.';
    }

    geckosSocket.emit('joinRoom', { roomID: room, env });
}

/**
 * Import robot mesh and add it to scene
 * @returns Robot mesh object
 */
const addRobot = async function () {
    let imported = await BABYLON.SceneLoader.ImportMeshAsync('', './src/', 'parallax_robot.gltf');
    imported.meshes[0].scaling.scaleInPlace(2);
    return imported.meshes[0];
};

// Create update function for robots

// Load geckos
var script = document.createElement('script');
script.type = 'text/javascript';
script.src = 'src/geckos.io-client.1.7.2.min.js';
document.body.appendChild(script);

setTimeout(() => {
    updateLoopFunctions.push((frameTime) => {
        if (bodies) {
            // Show robots
            for (let label of Object.keys(bodies)) {
                // create if new
                if (!Object.keys(bodyMeshes).includes(label)) {
                    if (bodiesInfo[label].image == 'parallax_robot') {
                        bodyMeshes[label] = addRobot().then(result => {
                            result.setPivotMatrix(BABYLON.Matrix.Translation(0, 1, 0), false);
                            result.position.y = 0.15;
                            bodyMeshes[label] = result;
                        });
                    } else {
                        bodyMeshes[label] = addBlock(bodiesInfo[label].width / 100, bodiesInfo[label].height / 100).then(result => {
                            result.setPivotMatrix(BABYLON.Matrix.Translation(0, 1, 0), false);
                            result.position.y = 1;
                            bodyMeshes[label] = result;
                        });
                    }
                } else {
                    // Detect not yet loaded mesh
                    if (typeof bodyMeshes[label].then === 'function') {
                        continue;
                    }

                    // Update position
                    let body = bodies[label];
                    let { x, y } = body.pos;
                    
                    let angle = body.angle;
                    // Extrapolate/Interpolate position and rotation
                    x += ((nextBodies[label].pos.x - x) * (frameTime - lastUpdateTime)) / Math.max(1, nextUpdateTime - lastUpdateTime);
                    y += ((nextBodies[label].pos.y - y) * (frameTime - lastUpdateTime)) / Math.max(1, nextUpdateTime - lastUpdateTime);
                    angle += ((nextBodies[label].angle - angle) * (frameTime - lastUpdateTime)) / Math.max(1, nextUpdateTime - lastUpdateTime);
    
                    bodyMeshes[label].position.x = x / 100;
                    bodyMeshes[label].position.z = -y / 100;
                    bodyMeshes[label].rotationQuaternion = null;
                    
                    if (bodiesInfo[label].image == 'parallax_robot') {
                        bodyMeshes[label].rotation.y = angle + Math.PI;
                    } else {
                        bodyMeshes[label].rotation.y = angle;
                    }
                    
                }
            }
        }
    });
}, 200);
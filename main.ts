import rh from './resize'
import utils from './utils'
import H3D from './class'
import { vec3, vec4 } from 'gl-matrix'


const { rad, deg } = utils;
const canvas = <HTMLCanvasElement>document.createElement('canvas');
const cw: number = 1000;
const ch: number = 1000;
canvas.height = ch;
canvas.width = cw;
const gl = <WebGLRenderingContext>canvas.getContext('webgl');
const mousePos = {
    x: 0,
    y: 0
}
const sensibility = .5;
const KeysDown: Set<number> = new Set();

const world = new H3D.World(rad(45), .1, 100, gl, [rad(-90), 0, 0], [0, 0, 0], [.2, .5, .2], [{
    color: [.5, .5, .5],
    dirrection: [0, -1, 1]
}], []);
const c = new H3D.Cube(world, '/shaders/vertexShader.glsl', '/shaders/FragmentShader.glsl', utils.createTextureFromColor(gl, [0, 255, 0, 255]), .5, [1, 0, 4])
const ico = new H3D.Icosahedron(world, '/shaders/vertexShader.glsl', '/shaders/fragmentShader.glsl', utils.createTextureFromColor(gl, [255, 0, 0, 255]), .5, [1, 0, 0]);
//const test = new H3D.UIPlane(0, 0, 100, 100, utils.createTextureFromColor(gl, [255, 255, 255, 255]), world, '/shaders/UIVertexShader.glsl', '/shaders/UIFragmentShader.glsl');

document.body.appendChild(canvas)

world.aspect = cw / ch;
function draw() {
    world.updateValues();
    world.render();
    requestAnimationFrame(draw);
}

function play() {
    const fac = .2;
    let vec: vec4 = vec4.create();
    const add = (x: number, y: number, z: number) => vec4.add(vec, vec, vec4.set(vec4.create(), x, y, z, 1));
    // z
    if (KeysDown.has(90)) {
        add(0, 0, -fac);
    }
    // s
    if (KeysDown.has(83)) {
        add(0, 0, fac);
    }
    // q
    if (KeysDown.has(81)) {
        add(-fac, 0, 0);
    }
    // d
    if (KeysDown.has(68)) {
        add(fac, 0, 0);
    }
    // space
    if (KeysDown.has(32)) {
        add(0, -fac, 0);
    }
    // tab
    if (KeysDown.has(9)) {
        add(0, fac, 0)
    }
    vec[3] = 1;
    world.cameraTranslation[1] += vec[1];
    const backpupY = world.cameraTranslation[1];
    vec3.add(world.cameraTranslation, world.cameraTranslation, <vec3>vec4.transformMat4(vec4.create(), vec, world.viewRotationMatrix).filter((v: number, i: number) => i < 3));
    world.cameraTranslation[1] = backpupY

}

window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    if (!captured) {
        mousePos.x = (e.clientX - rect.left) * canvas.width / canvas.clientWidth;
        mousePos.y = (e.clientY - rect.top) * canvas.height / canvas.clientHeight;
    } else {
        mousePos.x += e.movementX * canvas.width / canvas.clientWidth;
        mousePos.y += e.movementY * canvas.height / canvas.clientHeight;
    }
    world.cameraRotation[1] = mousePos.x / canvas.width * (Math.PI * 2) * sensibility;
    world.cameraRotation[0] = mousePos.y / canvas.height * (Math.PI * 2) * -1 * sensibility;
});
var captured = false;
canvas.addEventListener('click', e => {
    canvas.requestPointerLock();
    captured = true;
});

window.addEventListener('blur', () => {
    KeysDown.clear();
});

window.addEventListener("keydown", e => {
    if (!KeysDown.has(e.keyCode)) {
        KeysDown.add(e.keyCode);
    }
    if (e.keyCode === 9) {
        e.preventDefault();
    }
});

window.addEventListener("keyup", e => {
    if (KeysDown.has(e.keyCode)) {
        KeysDown.delete(e.keyCode);
    }
    if (e.keyCode === 9) {
        e.preventDefault();
    }
});

rh(canvas);
setInterval(play, 1000 / 60);
requestAnimationFrame(draw);
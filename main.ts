import * as utils from './utils'
import * as H3D from './class'
import { vec3, vec4, mat4 } from 'gl-matrix'
import rh from './resize'

const { rad, deg } = utils;
const canvas = <HTMLCanvasElement>document.createElement('canvas');
const cw: number = 1000;
const ch: number = 1000;
canvas.height = ch;
canvas.width = cw;
const gl = <WebGLRenderingContext>canvas.getContext('webgl');

const mousePos = {
    x: cw / 2,
    y: ch / 2
}
const shaders = {
    frag: '/shaders/fragmentShader.glsl',
    vert: '/shaders/vertexShader.glsl'
}
const UIShaders = {
    frag: '/shaders/UIFragmentShader.glsl',
    vert: '/shaders/UIVertexShader.glsl'
}
const sensibility = .25;
const KeysDown: Set<number> = new Set();
const canvas2d = <HTMLCanvasElement>document.createElement('canvas');
canvas2d.width = cw;
canvas2d.height = ch;
const canvas2dCtx = <CanvasRenderingContext2D>canvas2d.getContext('2d');


const world = new H3D.World(rad(45), .1, 100, gl, [rad(-180), rad(-180), 0], [0, 0, 0], [.2, .2, .2], [], [{
    color: <[number, number, number]>[0, 0, 0].fill(.5),
    position: [5, -5, -2]
}]);
//const c = new H3D.Cube(world, shaders.vert, shaders.frag, utils.createTextureFromColor(gl, [0, 255, 0, 255]), .5, [1, 0, 4])
const ico = new H3D.Icosphere(world, false, shaders.vert, shaders.frag, 1, utils.createTextureFromColor(gl, [255, 50, 50, 255]), .5, [0, 0, -3], [.5, .5, .5]);
const canvasOverlay = new H3D.UIPlane(0, 0, cw, ch, utils.createTextureFromCanvas(gl, canvas2d), world, UIShaders.vert, UIShaders.frag);
//const crosshair = new H3D.UIPlane(cw / 2 - 10, ch / 2 - 10, cw / 2 + 10, ch / 2 + 10, utils.loadTexture(gl, '/img/cursor.png'), world, "/shaders/UIVertexShader.glsl", '/shaders/UIFragmentShader.glsl');
//const test = new H3D.UIPlane(0, 0, 100, 100, utils.createTextureFromColor(gl, [255, 255, 255, 255]), world, UIShaders.vert, UIShaders.frag);

ico.lightPointDiffuseFac = 1;
ico.reflectivity = 1;
ico.exponant = 9999;
ico.lightAmbiantFac = 1;
ico.lightPointSpecularFac = 1;

document.body.appendChild(canvas)
let i = 0;
world.aspect = cw / ch;
function draw() {
    /*const pos: vec3 = [0, Math.cos(rad((i * 2) % 360)) / 4, 0];
    vec3.transformMat4(pos, pos, mat4.invert(mat4.create(), world.viewMatrix));
    //world.pointLights[0].position = pos;*/
    world.updateValues();
    udpateOverlayCanvas();
    world.render();
    i++;
    requestAnimationFrame(draw);
}

function udpateOverlayCanvas() {
    const ctx = canvas2dCtx;
    const objs = [ico];
    ctx.clearRect(0, 0, cw, ch);
    ctx.strokeStyle = "blue";
    ctx.lineWidth = .5;
    ctx.fillStyle = "red";
    for (let o of objs) {
        for (let i = 0; i < o.points.length; i++) {
            const l = .2;
            const p1 = o.points[i];
            const p2 = vec3.add(vec3.create(), p1, vec3.mul(vec3.create(), vec3.normalize(vec3.create(), o.normals[i]), [l, l, l]));
            const convX = (n: number) => (n + 1) * (cw / 2);
            const convY = (n: number) => (n + 1) * (ch / 2);
            const r1 = o.computeProjectedPosition(p1);
            const r2 = o.computeProjectedPosition(p2);
            if (r1[3] > 3.1) continue;
            ctx.lineWidth = 10 / (r1[3] * 2);
            ctx.beginPath();
            ctx.moveTo(convX(r1[0]), convY(r1[1]));
            ctx.lineTo(convX(r2[0]), convY(r2[1]));
            ctx.stroke();
            ctx.closePath();
            ctx.fillStyle = "red";
            ctx.beginPath();
            ctx.arc(convX(r1[0]), convY(r1[1]), 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
            ctx.fillStyle = "green";
            ctx.beginPath();
            ctx.arc(convX(r2[0]), convY(r2[1]), 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
            ctx.fillStyle = "orange";
            ctx.font = "Arial 50px";
            ctx.textBaseline = "middle";
            ctx.textAlign = "center";
            ctx.fillText((Math.floor(r1[3] * 10) / 10) + "", convX(r1[0]), convY(r1[1]) + 10);
        }
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, canvasOverlay.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas2d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
}

function play() {
    const fac = .01;
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
    if (KeysDown.has(38)) {
        ico.rotation[2] += rad(5);
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
    ico.rotation[1] = mousePos.x / canvas.width * (Math.PI * 2) * sensibility;
    ico.rotation[0] = mousePos.y / canvas.height * (Math.PI * 2) * -1 * sensibility;
});
var captured = false;
canvas.addEventListener('click', e => {
    canvas.requestPointerLock();
    captured = true;
    console.log(world.cameraRotation);
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
import { vec4, vec3 } from 'gl-matrix'
import rh from '../resize'
import utils from '../utils'
import classes from '../class'
const { createTextureFromColor, rad, deg, loadTexture, createTextureFromCanvas } = utils;
const { Primitive, World, Cube, Plane, UIPlane } = classes

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

let textureCanvas: HTMLCanvasElement;
const FPSCanvas = <HTMLCanvasElement>document.createElement('canvas');
let FPSCanvasCtx: CanvasRenderingContext2D;

{
    const TCs = <HTMLCanvasElement>document.createElement('canvas');
    const tw = 2048;
    const th = 2048;
    TCs.width = tw;
    TCs.height = th * 6;
    const tctx = <CanvasRenderingContext2D>TCs.getContext('2d');
    tctx.imageSmoothingEnabled = false;
    const img = new Image();
    img.src = "/img/stone.png";
    tctx.font = "160px Arial";
    const faces = ["top", 'bottom', "left", "right", "front", "back"];
    img.onload = () => {

        for (let i = 0; i < 6; i++) {
            tctx.drawImage(img, 0, th * i, tw, th + th * i);
            tctx.fillStyle = "white";
            tctx.fillText(faces[i], tw / 2 - tctx.measureText(faces[i]).width / 2, (th * (i)) + th / 2 - 20);
        }
        updateCanvas();
    }
    textureCanvas = TCs;
}
[FPSCanvas.width, FPSCanvas.height] = [1024, 1024];
FPSCanvasCtx = <CanvasRenderingContext2D>FPSCanvas.getContext("2d");


document.body.appendChild(canvas);

const fovSlider = <HTMLInputElement>document.querySelector("#fov");
const sensibility = .5;
var iteration = 0;


const world = new World(rad(90), .1, 100, gl, [0, 0, 0], [0, 0, 0], [.4, .3, .3], [
    /*{ color: <[number, number, number]>new Array(3).fill(.5), dirrection: vec3.fromValues(0.1, -1, -.6) },
    { color: <[number, number, number]>new Array(3).fill(.2), dirrection: vec3.fromValues(0.1, -1, .6) }*/
], [
    { position: vec3.fromValues(0, 0, -6), color: [1, .2, .2] }
]);
const cube1 = new Cube(
    world,
    "/shaders/vertexShader.glsl",
    "/shaders/fragmentShader.glsl",
    loadTexture(gl, '/img/wewd.png'),
    .9,
    vec3.fromValues(-.1, 0, -1),
    [1, 1, 1]
);
new Cube(
    world,
    "/shaders/vertexShader.glsl",
    "/shaders/fragmentShader.glsl",
    createTextureFromColor(gl, [255, 255, 255, 255]),
    1,
    vec3.fromValues(-1, .2, -12),
    [1, 1, 1]
).exponant = 512;
const cube2 = new Cube(
    world,
    "/shaders/vertexShader.glsl",
    "/shaders/fragmentShader.glsl",
    loadTexture(gl, '/img/wewd.png'),
    1,
    vec3.fromValues(5, 0, 0),
    [2, 2, 2]
);
const cube3 = new Cube(
    world,
    "/shaders/vertexShader.glsl",
    "/shaders/fragmentShader.glsl",
    createTextureFromColor(gl, [255, 0, 0, 255]),
    .5,
    vec3.fromValues(0, 10, 0),
    [5, 5, 5]
);
const infoUI = new UIPlane(0, 0, 150, 150, createTextureFromCanvas(gl, FPSCanvas), world, "/shaders/UIVertexShader.glsl", "/shaders/UIFragmentShader.glsl");
const crosshair = new UIPlane(cw / 2 - 10, ch / 2 - 10, cw / 2 + 10, ch / 2 + 10, loadTexture(gl, '/img/cursor.png'), world, "/shaders/UIVertexShader.glsl", '/shaders/UIFragmentShader.glsl');
const bondingBoxTest = new UIPlane(0, 0, 0, 0, createTextureFromColor(gl, [0, 255, 0, 10]), world, '/shaders/UIVertexShader.glsl', '/shaders/UIFragmentShader.glsl');
// set the cube3 texture coordinates
{
    const m = 1 / 6;
    cube3.textureCoordinates = [
        [0, 0 * m],
        [1, 0 * m],
        [1, 0 * m + m],
        [0, 0 * m + m],

        [0, 1 * m],
        [1, 1 * m],
        [1, 1 * m + m],
        [0, 1 * m + m],

        [0, 2 * m],
        [1, 2 * m],
        [1, 2 * m + m],
        [0, 2 * m + m],

        [0, 3 * m],
        [1, 3 * m],
        [1, 3 * m + m],
        [0, 3 * m + m],

        [0, 4 * m],
        [1, 4 * m],
        [1, 4 * m + m],
        [0, 4 * m + m],

        [0, 5 * m],
        [1, 5 * m],
        [1, 5 * m + m],
        [0, 5 * m + m],
    ];
    // recompute buffers
    cube3.updateBuffers();
}

function updateCanvas() {
    cube3.texture = createTextureFromCanvas(gl, textureCanvas);
}

function updateFpsCanvas(fps: number) {
    const ctx = FPSCanvasCtx;
    const fw = FPSCanvas.width;
    const fh = FPSCanvas.height;
    ctx.clearRect(0, 0, fw, fh);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, fw, fh);
    ctx.font = "130px Arial"
    ctx.fillStyle = "white";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const fill0 = (n: number) => (n < 0 ? "-" : " ") + (Math.abs(n) >= 100 ? "" : "0") + (Math.abs(n) >= 10 ? "" : "0") + Math.abs(n);
    const text =
        `${fps} FPS
x: ${Math.floor(mousePos.x)}
y: ${Math.floor(mousePos.y)}
rx: ${fill0(Math.floor(deg(world.cameraRotation[0])))}
ry: ${fill0(Math.floor(deg(world.cameraRotation[1])))}
rz: ${fill0(Math.floor(deg(world.cameraRotation[2])))}
`.trim().split(/\n/);
    const height = 100;
    for (let i = 0; i < text.length; i++) {
        ctx.fillText(text[i], fw / 2, fh / 2 + ((i - Math.floor(text.length / 2)) * height));
    }
}


world.cameraRotation[1] = -rad(90);

function draw() {
    const t = performance.now();
    world.updateValues();
    cube1.rotation = vec3.fromValues(iteration / 2 % 360, iteration % 360, iteration / 4 % 360);
    cube2.rotation = vec3.fromValues(iteration / 2 % 360, iteration % 360, iteration / 4 % 360);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, infoUI.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, FPSCanvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const tt = performance.now() - t;
    updateFpsCanvas(Math.floor(1000 / tt));
    {
        const { x, y, dx, dy } = cube1.get2dScreenBoundingBox();
        // if the object is offscreen
        if (x === 0 && y === 0 && dx === 0 && y === 0) {
            [bondingBoxTest.x, bondingBoxTest.y, bondingBoxTest.dx, bondingBoxTest.dy] = [0, 0, 0, 0];
            bondingBoxTest.updateBuffers();
        }
        else {
            const convX = (n: number) => (n + 1) * (cw / 2);
            const convY = (n: number) => (n + 1) * (ch / 2);
            bondingBoxTest.x = convX(x);
            bondingBoxTest.y = convY(y);
            bondingBoxTest.dx = convX(dx);
            bondingBoxTest.dy = convY(dy);
            bondingBoxTest.updateBuffers();
        }
    }

    world.render();
    iteration += 0.01;
    requestAnimationFrame(draw);
}

const KeysDown: Set<number> = new Set();

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


fovSlider.addEventListener('input', e => {
    world.fov = rad(<number><unknown>fovSlider.value);
});

window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    if (!captured) {
        mousePos.x = (e.clientX - rect.left) * canvas.width / canvas.clientWidth;
        mousePos.y = (e.clientY - rect.top) * canvas.height / canvas.clientHeight;
    } else {
        mousePos.x += e.movementX * canvas.width / canvas.clientWidth;
        mousePos.y += e.movementY * canvas.height / canvas.clientHeight;
    }
    //[cursor.x, cursor.y, cursor.dx, cursor.dy] = [mousePos.x - 10, mousePos.y * -1 + canvas.height - 10, mousePos.x + 10, mousePos.y * -1 + canvas.height + 10];
    //cursor.updateBuffers();
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

draw();
setInterval(play, 1000 / 60);
rh(canvas);

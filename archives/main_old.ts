import { mat4 } from 'gl-matrix'
import rh from '../resize'

const timeaverage: number[] = [];

interface ProgramInfo {
    program: WebGLProgram,
    attribLocations: {
        name: string,
        location: number
    }[],
    uniformLocations: {
        name: string,
        location: WebGLUniformLocation
    }[],
};

const aLocation: string[] = [
    "aVertexPosition",
    "aVertexColor",
    "aTextureCoord",
    "aVertexNormal"
];
const uLocation: string[] = [
    "uProjectionMatrix",
    "uModelViewMatrix",
    "uSampler",
    "uNormalMatrix",
    "uAmbiantLight",
    "uDirectionalLightColor",
    "uDirectionalVector"
];

interface BufferData {
    attributes: {
        comp: number,
        value: WebGLBuffer,
        location: number
    }[],
    indexs: WebGLBuffer
};

const canvas = <HTMLCanvasElement>document.createElement('canvas');
const fpsDiv = <HTMLDivElement>document.querySelector('#fps');
const cw: number = 1000;
const ch: number = 1000;
canvas.height = ch;
canvas.width = cw;
const gl = <WebGLRenderingContext>canvas.getContext('webgl', { antialias: false });

document.body.appendChild(canvas)

gl.clearColor(0, 0, 0, 1);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);



rh(canvas);

let i = 0;

type N3 = [number, number, number];

function draw(gl: WebGLRenderingContext, programInfo: ProgramInfo, buffers: BufferData, texture?: WebGLTexture) {
    let startingTime = performance.now();
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE)

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const fov = rad(45);
    const c = <HTMLCanvasElement>gl.canvas;
    const aspect = cw / ch;
    const zNear = 0.1;
    const zFar = 100;
    const projectionMatrix = mat4.create();
    const translate: N3 = [0, 0, -5];
    const rotate: N3 = <N3>rad([i / 2 % 360, i % 360, i / 4 % 360]);
    const scale: N3 = [1, 1, 1];
    const ambiantLighting: N3 = <N3>new Array(3).fill(.1);
    const dirrectionalLightColor: N3 = [.5, .5, .5];
    const dirrectionalLightVector: N3 = [.85, .80, .75];
    mat4.perspective(projectionMatrix, fov, aspect, zNear, zFar);

    const modelViewMatrix = mat4.create();

    mat4.translate(modelViewMatrix, modelViewMatrix, translate);
    mat4.rotate(modelViewMatrix, modelViewMatrix, rotate[0], [1, 0, 0]);
    mat4.rotate(modelViewMatrix, modelViewMatrix, rotate[1], [0, 1, 0]);
    mat4.rotate(modelViewMatrix, modelViewMatrix, rotate[2], [0, 0, 1]);
    mat4.scale(modelViewMatrix, modelViewMatrix, scale);

    //? not sure of the name, it bind the shader attributes to teir value ?
    const passArg = (comp: number, buffer: WebGLBuffer, position: number, type = gl.FLOAT, normalize = false, stride = 0, offset = 0) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.vertexAttribPointer(position, comp, type, normalize, stride, offset);
        gl.enableVertexAttribArray(position);
    }
    gl.useProgram(programInfo.program);

    for (let i of buffers.attributes) {
        passArg(i.comp, i.value, programInfo.attribLocations[i.location].location);
    }
    if (texture !== undefined) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture)
    }

    const normalMatrix = mat4.create();
    mat4.invert(normalMatrix, modelViewMatrix);
    mat4.transpose(normalMatrix, normalMatrix);

    gl.uniformMatrix4fv(programInfo.uniformLocations[0].location, false, projectionMatrix);
    gl.uniformMatrix4fv(programInfo.uniformLocations[1].location, false, modelViewMatrix);
    gl.uniform1i(programInfo.uniformLocations[2].location, 0);
    gl.uniformMatrix4fv(programInfo.uniformLocations[3].location, false, normalMatrix);
    gl.uniform3fv(programInfo.uniformLocations[4].location, ambiantLighting);
    gl.uniform3fv(programInfo.uniformLocations[5].location, dirrectionalLightColor);
    gl.uniform3fv(programInfo.uniformLocations[6].location, dirrectionalLightVector);

    {
        const offset = 0;
        const type = gl.UNSIGNED_SHORT;
        const vertexCount = 36;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indexs);
        gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
    }



    i++;
    timeaverage.push(performance.now() - startingTime);
    if (timeaverage.length > 10) timeaverage.shift();
    requestAnimationFrame(() => draw(gl, programInfo, buffers));
}

function play() {
    let average = 0;
    timeaverage.map(v => average += v);
    average = average / timeaverage.length;
    const fps = 1000 / average;
    fpsDiv.innerHTML = Math.floor(fps) + "FPS";
}


async function main() {

    const vshader = (await (await fetch("/shaders/vertexShader.glsl")).text()).toString();
    const fshader = (await (await fetch("/shaders/fragmentShader.glsl")).text()).toString();
    const shaderProgram = initShaderProgram(gl, vshader, fshader);
    const programInfo: ProgramInfo = {
        program: shaderProgram,
        attribLocations: [],
        uniformLocations: [],
    }
    for (let i of aLocation) {
        programInfo.attribLocations.push({
            name: i,
            location: gl.getAttribLocation(shaderProgram, i)
        });
    }
    for (let i of uLocation) {
        const location = gl.getUniformLocation(shaderProgram, i);
        if (location === null) {
            console.log(i)
            continue;
        }
        programInfo.uniformLocations.push({
            name: i,
            location: <WebGLUniformLocation>location
        });
    }
    console.log(programInfo)
    const texture = loadTexture(gl, '/img/wewd.png');
    draw(gl, programInfo, initBuffers(gl), texture);
    setInterval(play, 1000 / 60);
}
main();


function loadShader(gl: WebGLRenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (shader === null) throw new TypeError("Error while loading shader: shader is null");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const err = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error("An Error occured while compilling the shader: " + err);
    }

    return shader;
}

function initShaderProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
    const vShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const shaderProgram = gl.createProgram();
    if (shaderProgram === null) throw new TypeError("Error while creating shader program: program is null");
    gl.attachShader(shaderProgram, vShader);
    gl.attachShader(shaderProgram, fShader);
    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        throw new Error("Unable to initilize the shader program : " + gl.getProgramInfoLog(shaderProgram));
    }

    return shaderProgram
}

function initBuffers(gl: WebGLRenderingContext): BufferData {
    const positionBuffer = gl.createBuffer();
    if (positionBuffer === null) throw new TypeError("position Buffer is null");
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const position = [
        // Face avant
        -1.0, -1.0, 1.0,
        1.0, -1.0, 1.0,
        1.0, 1.0, 1.0,
        -1.0, 1.0, 1.0,

        // Face arrière
        -1.0, -1.0, -1.0,
        -1.0, 1.0, -1.0,
        1.0, 1.0, -1.0,
        1.0, -1.0, -1.0,

        // Face supérieure
        -1.0, 1.0, -1.0,
        -1.0, 1.0, 1.0,
        1.0, 1.0, 1.0,
        1.0, 1.0, -1.0,

        // Face inférieure
        -1.0, -1.0, -1.0,
        1.0, -1.0, -1.0,
        1.0, -1.0, 1.0,
        -1.0, -1.0, 1.0,

        // Face droite
        1.0, -1.0, -1.0,
        1.0, 1.0, -1.0,
        1.0, 1.0, 1.0,
        1.0, -1.0, 1.0,

        // Face gauche
        -1.0, -1.0, -1.0,
        -1.0, -1.0, 1.0,
        -1.0, 1.0, 1.0,
        -1.0, 1.0, -1.0
    ]
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(position), gl.STATIC_DRAW);

    const facecolors = [
        [1.0, 1.0, 1.0, 1.0],
        [1.0, 0.0, 0.0, 1.0],
        [0.0, 1.0, 0.0, 1.0],
        [0.0, 0.0, 1.0, 1.0],
        [1.0, 1.0, 0.0, 1.0],
        [1.0, 0.0, 1.0, 1.0]
    ]
    let colors: number[] = [];
    for (let i of facecolors) {
        colors = colors.concat(i, i, i, i);
    }

    const colorBuffer = gl.createBuffer();
    if (colorBuffer === null) throw new TypeError("color Buffer is null");
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    if (indexBuffer === null) throw new TypeError('indexBuffer is null');
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    const indexs = [
        0, 1, 2, 0, 2, 3,
        4, 5, 6, 4, 6, 7,
        8, 9, 10, 8, 10, 11,
        12, 13, 14, 12, 14, 15,
        16, 17, 18, 16, 18, 19,
        20, 21, 22, 20, 22, 23
    ];
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexs), gl.STATIC_DRAW);

    const textureBuffer = gl.createBuffer();
    if (textureBuffer === null) throw new TypeError('textureBuffer is null');
    gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer);

    const textureCoordinates = [
        // Front
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
        // Back
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
        // Top
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
        // Bottom
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
        // Right
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
        // Left
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);


    const normalBuffer = gl.createBuffer();
    if (normalBuffer === null) throw new TypeError('normalBuffer is null');
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    const normals = [
        // Front
        0.0, 0.0, 1.0,
        0.0, 0.0, 1.0,
        0.0, 0.0, 1.0,
        0.0, 0.0, 1.0,

        // Back
        0.0, 0.0, -1.0,
        0.0, 0.0, -1.0,
        0.0, 0.0, -1.0,
        0.0, 0.0, -1.0,

        // Top
        0.0, 1.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 1.0, 0.0,

        // Bottom
        0.0, -1.0, 0.0,
        0.0, -1.0, 0.0,
        0.0, -1.0, 0.0,
        0.0, -1.0, 0.0,

        // Right
        1.0, 0.0, 0.0,
        1.0, 0.0, 0.0,
        1.0, 0.0, 0.0,
        1.0, 0.0, 0.0,

        // Left
        -1.0, 0.0, 0.0,
        -1.0, 0.0, 0.0,
        -1.0, 0.0, 0.0,
        -1.0, 0.0, 0.0
    ]
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);


    return {
        attributes: [
            {
                location: 0,
                value: positionBuffer,
                comp: 3
            }, /*{
                location: 1,
                value: colorBuffer,
                comp: 4
            },*/ {
                location: 2,
                value: textureBuffer,
                comp: 2
            }, {
                location: 3,
                value: normalBuffer,
                comp: 3
            }
        ],
        indexs: indexBuffer
    };
}

function rad(angle: number): typeof angle;
function rad(angles: number[]): typeof angles;
function rad(a: number | number[]): number | number[] {
    if (Array.isArray(a)) {
        // i really don't know what is wrong here
        /// @ts-expect-error
        return a.map(rad);
    } else {
        return a / 180 * Math.PI;
    }
}
function loadTexture(gl: WebGLRenderingContext, url: string) {
    const texture = gl.createTexture();
    if (texture === null) throw new TypeError('texture is null');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const level = 0;
    const interalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([0, 0, 255, 255]);
    gl.texImage2D(gl.TEXTURE_2D, level, width, height, border, interalFormat, srcFormat, srcType, pixel);
    const image = new Image();
    image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, level, interalFormat, srcFormat, srcType, image);
        if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        }
    }
    image.src = url;
    return texture
}
// definitly did not steal that code
const isPowerOf2 = (n: number) => (n & (n - 1)) == 0;

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

async function fetchShaders(vShaderUrl: string, fShaderUrl: string) {
    return {
        fragmentShader: (await (await (fetch(fShaderUrl))).text()).toString(),
        vertexShader: (await (await (fetch(vShaderUrl))).text()).toString(),
    }
}

interface cubeMapUrlTexture {
    px: string,
    py: string,
    pz: string,
    nx: string,
    ny: string,
    nz: string
}

type _color = [number, number, number, number]

interface cubeMapColor {
    px: _color,
    py: _color,
    pz: _color,
    nx: _color,
    ny: _color
    nz: _color
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

function rad(deg: number): typeof deg;
function rad(degs: number[]): typeof degs;
function rad(a: number | number[]): number | number[] {
    if (Array.isArray(a)) {
        // i really don't know what is wrong here
        /// @ts-expect-error
        return a.map(rad);
    } else {
        return a / 180 * Math.PI;
    }
}

function deg(rad: number): number;
function deg(rads: number[]): typeof rads;
function deg(a: number | number[]): number | number[] {
    if (typeof a === "number") {
        return a / Math.PI * 180;
    } else {
        // again i don't know map takes a number[] and returns a number[]
        ///@ts-expect-error
        return a.map(deg);
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
    gl.texImage2D(gl.TEXTURE_2D, level, interalFormat, width, height, border, srcFormat, srcType, pixel);
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

function loadCubeMapTexture(gl: WebGLRenderingContext, urls: cubeMapUrlTexture, powerOf2: boolean) {
    const texture = gl.createTexture();
    if (texture === null) throw new TypeError('texture is null in loadCubeMapTexture')
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    const faceInfo = [
        {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, url: urls.nx},
        {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, url: urls.ny},
        {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, url: urls.nz},
        {target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, url: urls.px},
        {target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, url: urls.py},
        {target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, url: urls.pz}
    ]
    faceInfo.forEach(info => {
        gl.texImage2D(info.target, 0,gl.RGBA,  1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]))
        const image = new Image();
        image.onload = () => {
            gl.texImage2D(info.target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            if(isPowerOf2(image.width) && isPowerOf2(image.height)) {
                gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
                gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            } else {
                gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            }
        }
        image.src = info.url;
    });
    return texture;
}

function createCubeMapTextureFromColor(gl: WebGLRenderingContext, color: cubeMapColor) {
    const texture = gl.createTexture();
    if (texture === null) throw new TypeError('texture is null in loadCubeMapTexture')
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    const faceInfo = [
        {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, color: color.nx},
        {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, color: color.ny},
        {target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, color: color.nz},
        {target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, color: color.px},
        {target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, color: color.py},
        {target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, color: color.pz}
    ]
    faceInfo.forEach(info => {
        gl.texImage2D(info.target, 0,gl.RGBA,  1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(info.color));
    });
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return texture;
}

// definitly did not steal that code
const isPowerOf2 = (n: number) => (n & (n - 1)) == 0;
/**
 * create a new webgl buffer and cast an error if null, just to avoid spamming ///@ts-ingore everywhere
 * @param gl webgl rendering context
 * @param name name for the error essentially for debugging
 */
function createBuffer(gl: WebGLRenderingContext, name: string = "a") {
    const b = gl.createBuffer();
    if (b === null) throw new TypeError(name + " Buffer is null");
    return b;
}

function createTextureFromColor(gl: WebGLRenderingContext, color: [number, number, number, number]) {
    const texture = gl.createTexture();
    if (texture === null) throw new TypeError("texture is null");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const level = 0;
    const interalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array(color);
    gl.texImage2D(gl.TEXTURE_2D, level, interalFormat, width, height, border, srcFormat, srcType, pixel);
    return texture;
}

function createTextureFromCanvas(gl: WebGLRenderingContext, canvas: HTMLCanvasElement) {
    const texture = createTextureFromColor(gl, [0, 0, 255, 255]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    if (isPowerOf2(canvas.width) && isPowerOf2(canvas.height)) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    }
    return texture;
}

export {
    createBuffer,
    isPowerOf2,
    loadShader,
    loadTexture,
    initShaderProgram,
    createTextureFromColor,
    rad,
    fetchShaders,
    createTextureFromCanvas,
    deg,
    loadCubeMapTexture,
    createCubeMapTextureFromColor
}
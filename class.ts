import Vector3 from './vector3'
import { mat4, vec4, vec2 } from 'gl-matrix'
import { v4 as uuidV4 } from 'uuid';
import utils from './utils'
// i don't know why i can't do import { createBuffer, ...} from './utils' so ill do it this way
const {
    createBuffer,
    initShaderProgram,
    fetchShaders,
    rad
} = utils;

type N3 = [number, number, number];
type N4 = [number, number, number, number];

const MAXLIGHT = 32;

interface BufferData {
    attributes: BufferDataAttribute[],
    customAttributes: BufferDataAttribute[],
    uniforms: {
        method: UniformTypes,
        location: number,
        value: (thisObj: Primitive) => any[]
    }[]
    indexs: WebGLBuffer,
    indexsLength: number
};

interface BufferDataAttribute {
    comp: number,
    value: WebGLBuffer,
    location: number,
    offset?: number,
    type?: number,
    normalize?: boolean,
    stride?: number,
}

enum UniformTypes {
    "uniform1f",
    "uniform1fv",
    "uniform1i",
    "uniform1iv",
    "uniform2f",
    "uniform2fv",
    "uniform2i",
    "uniform2iv",
    "uniform3f",
    "uniform3fv",
    "uniform3i",
    "uniform3iv",
    "uniform4f",
    "uniform4fv",
    "uniform4i",
    "uniform4iv",
    "uniformMatrix2fv",
    "uniformMatrix3fv",
    "uniformMatrix4fv"
}



class Primitive {
    static MAX_LIGHTS = 64;
    points: Vector3[];
    tris: N3[];
    normals: Vector3[];
    private ready: boolean = false;
    world: World;
    uuid: string = uuidV4();
    scale: Vector3;
    translation: Vector3;
    rotation: Vector3;
    attributes: string[] = [
        "aVertexPosition",
        "aTextureCoord",
        "aVertexNormal"
    ];
    uniforms: string[] = [
        "uProjectionMatrix", // 0
        "uModelViewMatrix", // 1
        "uSampler", // 2
        "uNormalMatrix", // 3
        "uAmbiantLight", // 4
        "uDirectionalLightsColor", // 5
        "uDirectionalsVector", // 6
        "uViewRotationMatrix", // 7
        "uPointLightsPositions", // 8
        "uPointLightsColor", // 9
        "uReflectivity", // 10
        "uExponant" // 11
    ];
    reflectivity: number;
    attributesLocations: number[] = [];
    uniformsLocations: WebGLUniformLocation[] = [];
    bufferData: BufferData;
    modelMatrix: mat4 = mat4.create();
    modelViewMatrix: mat4 = mat4.create();
    directionalLights: dirrectionalLight[] = [];
    // null before shaders are loaded
    programShader: WebGLProgram | null = null;
    textureCoordinates: [number, number][];
    texture: WebGLTexture;
    pointLights: PointLight[];
    movedPointLights: PointLight[] = [];
    exponant = 32;
    constructor(points: Vector3[], tris: N3[], normals: Vector3[], world: World, vertexShaderUrl: string, fragmentShaderUrl: string, textureCoordinates: [number, number][], texture: WebGLTexture, reflectivity: number, translation: Vector3 = Vector3.null, scale: Vector3 = new Vector3(1, 1, 1), rotation: Vector3 = Vector3.null) {
        this.world = world;
        this.bufferData = {
            attributes: [],
            customAttributes: [],
            uniforms: [
                { method: UniformTypes.uniformMatrix4fv, location: 0, value: thisObj => [thisObj.world.projectionMatrix] },
                { method: UniformTypes.uniformMatrix4fv, location: 1, value: thisObj => [thisObj.modelViewMatrix] },
                { method: UniformTypes.uniform1i, location: 2, value: thisObj => [0] },
                { method: UniformTypes.uniformMatrix4fv, location: 3, value: thisObj => { const out = mat4.invert(mat4.create(), thisObj.modelViewMatrix); return [mat4.transpose(out, out)] } },
                { method: UniformTypes.uniform3fv, location: 4, value: thisObj => [thisObj.world.ambiantLight] },
                { method: UniformTypes.uniform3fv, location: 5, value: thisObj => { const res: number[] = []; thisObj.directionalLights.map(v => res.push(...v.color)); while (res.length < Primitive.MAX_LIGHTS) { res.push(0, 0, 0) }; return [res] } },
                { method: UniformTypes.uniform3fv, location: 6, value: thisObj => { const res: number[] = []; thisObj.directionalLights.map(v => res.push(...v.dirrection.toArray())); while (res.length < Primitive.MAX_LIGHTS) { res.push(0, 0, 0) }; return [res] } },
                { method: UniformTypes.uniformMatrix4fv, location: 7, value: thisObj => [thisObj.world.viewRotationMatrix] },
                { method: UniformTypes.uniform3fv, location: 8, value: thisObj => { const res: number[] = []; thisObj.movedPointLights.map(v => res.push(...v.position.toArray())); while (res.length < Primitive.MAX_LIGHTS) { res.push(0, 0, 0) }; return [res] } },
                { method: UniformTypes.uniform3fv, location: 9, value: thisObj => { const res: number[] = []; thisObj.pointLights.map(v => res.push(...v.color)); while (res.length < Primitive.MAX_LIGHTS) { res.push(0, 0, 0) }; return [res] } },
                { method: UniformTypes.uniform1f, location: 10, value: thisObj => [thisObj.reflectivity] },
                { method: UniformTypes.uniform1i, location: 11, value: thisObj => [thisObj.exponant] }
            ],
            indexs: <WebGLBuffer>this.gl.createBuffer(),
            indexsLength: 0
        }
        this.reflectivity = reflectivity;
        this.points = points;
        this.tris = tris;
        this.normals = normals;
        this.texture = texture;
        this.textureCoordinates = textureCoordinates;
        this.translation = translation;
        this.scale = scale;
        this.rotation = rotation;
        if (this.points.length !== this.normals.length) throw new Error("you must give a normal for each points");
        this.directionalLights = this.world.directionalLights;
        this.pointLights = this.world.pointLights;
        this.world.add(this);
        this.bufferData = this.initBuffer();
        fetchShaders(vertexShaderUrl, fragmentShaderUrl).then(v => {
            this.programShader = initShaderProgram(this.gl, v.vertexShader, v.fragmentShader)
            this.computeLocations();
            this.ready = true;
            this.updateMatricies(true);
        }).catch(r => {
            console.error(r);
            throw new Error("Coudln't fetch shaders, probably a wrong url or an error in the shader itself");
        });
    }
    /**
     * called to update the model matrix or by the world to update modelViewMatrix
     * @param worldCall set to false by default for performance reason, no point in setting to true manually
     */
    updateMatricies(worldCall = false) {
        this.modelMatrix = mat4.create();
        mat4.identity(this.modelMatrix);
        mat4.translate(this.modelMatrix, this.modelMatrix, this.translation.toArray());
        mat4.rotate(this.modelMatrix, this.modelMatrix, this.rotation.x, [1, 0, 0]);
        mat4.rotate(this.modelMatrix, this.modelMatrix, this.rotation.y, [0, 1, 0]);
        mat4.rotate(this.modelMatrix, this.modelMatrix, this.rotation.z, [0, 0, 1]);
        mat4.scale(this.modelMatrix, this.modelMatrix, this.scale.toArray());
        this.modelViewMatrix = mat4.create();
        mat4.multiply(this.modelViewMatrix, this.world.viewMatrix, this.modelMatrix);
        if (worldCall) {
            const res: PointLight[] = [];
            for (let i of this.pointLights) {
                res.push({
                    color: i.color,
                    position: Vector3.fromArray(<N3>vec4.transformMat4(vec4.create(), vec4.set(vec4.create(), i.position.x, i.position.y, i.position.z, 1), this.world.viewMatrix).filter((v: number, i: number) => i < 3))
                })
            }
            this.movedPointLights = res;
        }
    }
    get gl() {
        return this.world.gl;
    }
    /**
     * get the 2d bonding box of the element
     * i would have liked to to it in a shader to avoid computing matricies multiplication on the cpu that much
     * but i don't want to use more than two passes so i'll do it this way
     */
    getBoundingBox() {
        const transformedVerticiesX: number[] = [];
        const transformedVerticiesY: number[] = [];
        for (let v of this.points) {
            const vec = vec4.set(vec4.create(), v.x, v.y, v.z, 1);
            vec4.transformMat4(vec, vec, this.modelViewMatrix);
            vec4.transformMat4(vec, vec, this.world.projectionMatrix);
            // if w is less than 0 the object is off screen
            if (vec[3] <= 0) continue;
            const dVec = vec.map((v: number) => v / vec[3]);
            transformedVerticiesX.push(dVec[0]);
            transformedVerticiesY.push(dVec[1]);
        }
        if (transformedVerticiesX.length > 0 && transformedVerticiesY.length > 0) {
            const minX = Math.min(...transformedVerticiesX);
            const minY = Math.min(...transformedVerticiesY);
            const maxX = Math.max(...transformedVerticiesX);
            const maxY = Math.max(...transformedVerticiesY);
            return {
                x: minX,
                y: minY,
                dx: maxX,
                dy: maxY
            }
        } else {
            return {
                x: 0,
                y: 0,
                dx: 0,
                dy: 0
            }
        }
    }
    initBuffer(): BufferData {
        const { gl } = this;

        const positions: number[] = [];
        const PBuffer = createBuffer(gl, "position");
        this.points.forEach(v => positions.push(...v.toArray()));
        gl.bindBuffer(gl.ARRAY_BUFFER, PBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

        const indexes: number[] = [];
        const IBuffer = createBuffer(gl, "indexes");
        this.tris.forEach(v => indexes.push(...v));
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, IBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexes), gl.STATIC_DRAW);

        const textureCoord: number[] = [];
        this.textureCoordinates.forEach(v => textureCoord.push(...v));
        const TBuffer = createBuffer(gl, 'textureCoordinates');
        gl.bindBuffer(gl.ARRAY_BUFFER, TBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoord), gl.STATIC_DRAW);

        const normals: number[] = [];
        const NBuffer = createBuffer(gl, 'normals');
        this.normals.forEach(v => normals.push(...v.toArray()));
        gl.bindBuffer(gl.ARRAY_BUFFER, NBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
        return {
            indexs: IBuffer,
            attributes: [
                {
                    location: 0,
                    value: PBuffer,
                    comp: 3
                }, {
                    location: 1,
                    value: TBuffer,
                    comp: 2
                }, {
                    location: 2,
                    value: NBuffer,
                    comp: 3
                }
            ],
            customAttributes: this.bufferData.customAttributes,
            uniforms: this.bufferData.uniforms,
            indexsLength: indexes.length
        }
    }
    computeLocations() {
        // because computeLocations are only called once program shader is set;
        this.programShader = <WebGLProgram>this.programShader;
        const aRes: number[] = [];
        const uRes: WebGLUniformLocation[] = [];
        for (let i of this.attributes) {
            aRes.push(this.gl.getAttribLocation(this.programShader, i));
        }
        for (let i of this.uniforms) {
            const tmp = this.gl.getUniformLocation(this.programShader, i);
            if (tmp === null) throw new TypeError("gl.getUniformLocation(this.programShader, " + i + ") returns null");
            uRes.push(tmp);
        }
        this.attributesLocations = aRes;
        this.uniformsLocations = uRes;
    }
    addAttribute(name: string, value: WebGLBuffer, component: number, type: number = this.gl.FLOAT, normalize = true, offset = 0, stride = 0): Primitive {
        this.attributes.push(name);
        this.bufferData.attributes.push({
            comp: component,
            location: this.attributes.length - 1,
            value: value,
            normalize: normalize,
            offset: offset,
            stride: stride,
            type: type
        });
        this.computeLocations();
        return this;
    }
    addUniform(name: string, method: UniformTypes, value: (thisObj: Primitive) => any[]) {
        this.uniforms.push(name);
        this.bufferData.uniforms.push({
            location: this.uniforms.length - 1,
            method: method,
            value: value
        });
        this.computeLocations();
    }
    updateBuffers() {
        this.bufferData = this.initBuffer();
    }
    draw() {
        if (!this.ready) return;
        const { gl } = this;
        const passArg = (comp: number, buffer: WebGLBuffer, position: number, type = gl.FLOAT, normalize = false, stride = 0, offset = 0) => {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.vertexAttribPointer(position, comp, type, normalize, stride, offset);
            gl.enableVertexAttribArray(position);
        }
        gl.useProgram(this.programShader);
        for (let i of [...this.bufferData.attributes, ...this.bufferData.customAttributes]) {
            passArg(i.comp, i.value, this.attributesLocations[i.location], i.type, i.normalize, i.stride, i.offset);
        }
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        // verry sketchy code here but ill just hope it works and if it does never touch it again
        for (let i of this.bufferData.uniforms) {
            // ingoring here because i can't tell typescript that UniformTypes properties are from gl
            ///@ts-ignore
            const method = (<(...args: any[]) => any><unknown>(gl[UniformTypes[i.method]]));
            const args1 = [this.uniformsLocations[i.location]];
            const args2 = (i.method === UniformTypes.uniformMatrix2fv ||
                i.method === UniformTypes.uniformMatrix3fv ||
                i.method === UniformTypes.uniformMatrix4fv) ? [false] : [];
            const args3 = [...i.value(this)];
            const args = [...args1, ...args2, ...args3];
            method.bind(gl)(...args);
        }

        const offset = 0;
        const type = gl.UNSIGNED_SHORT;
        const vertexCount = this.bufferData.indexsLength;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bufferData.indexs);
        gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
    }
}


class World {
    private _aspect: number;
    gl: WebGLRenderingContext;
    canvas: HTMLCanvasElement;
    private _zFar: number;
    private _zNear: number;
    private _fov: number;
    projectionMatrix: mat4 = mat4.create();
    viewMatrix: mat4 = mat4.create();
    private _cameraRotation: Vector3;
    private _cameraTranslation: Vector3;
    objectList: Map<string, Primitive> = new Map<string, Primitive>([]);
    ambiantLight: ambiantLight = [.2, .2, .2];
    /**
     * the directional lights of the world,
     * max ammount defined in shader
     */
    directionalLights: dirrectionalLight[] = [];
    /**
     * the point lights of the world,
     * max ammount defined in shader
     */
    pointLights: PointLight[] = [];
    preRenderInstructions: ((gl: WebGLRenderingContext) => any)[] = [
        gl => {
            gl.clearColor(0, 0, 0, 1);
            gl.clearDepth(1);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.enable(gl.BLEND);
            gl.disable(gl.CULL_FACE);
        },
        gl => {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
    ];
    // to fix lightning not rotating with the camera
    viewRotationMatrix: mat4 = mat4.create();
    constructor(fov: number, zNear: number, zFar: number, gl: WebGLRenderingContext, cameraRotation: Vector3, cameraTranslation: Vector3, ambiantLight?: ambiantLight, directionalLights: dirrectionalLight[] = [], pointLights: PointLight[] = []) {
        this._fov = fov;
        this._zNear = zNear;
        this._zFar = zFar;
        this.canvas = <HTMLCanvasElement>gl.canvas;
        this.gl = gl;
        this._aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this._cameraRotation = cameraRotation;
        this._cameraTranslation = cameraTranslation;
        if (ambiantLight !== undefined)
            this.ambiantLight = ambiantLight;
        //? why the concat ???
        this.directionalLights = this.directionalLights.concat(...directionalLights);
        this.pointLights = pointLights;
        this.updateValues();
    }
    addPreRenderInstruction(...func: ((gl: WebGLRenderingContext) => any)[]) {
        this.preRenderInstructions.push(...func);
        return this;
    }
    updateValues() {
        mat4.perspective(this.projectionMatrix, this.fov, this.aspect, this.zNear, this.zFar);
        this.viewMatrix = mat4.create();
        this.viewRotationMatrix = mat4.create();
        mat4.identity(this.viewRotationMatrix);
        mat4.rotateX(this.viewRotationMatrix, this.viewRotationMatrix, this.cameraRotation.multiply(-1).x);
        mat4.rotateY(this.viewRotationMatrix, this.viewRotationMatrix, this.cameraRotation.multiply(-1).y);
        mat4.rotateZ(this.viewRotationMatrix, this.viewRotationMatrix, this.cameraRotation.multiply(-1).z);
        mat4.identity(this.viewMatrix);
        mat4.translate(this.viewMatrix, this.viewMatrix, this.cameraTranslation.multiply(-1).toArray());
        mat4.multiply(this.viewMatrix, this.viewRotationMatrix, this.viewMatrix);
        this.objectList.forEach(v => {
            v.updateMatricies(true);
        });
    }
    render() {
        this.preRenderInstructions.forEach(f => f(this.gl));
        this.objectList.forEach(v => {
            v.draw();
        });
    }
    set fov(value: number) {
        this._fov = value;
        this.updateValues();
    }
    get fov() {
        return this._fov;
    }
    set zNear(value: number) {
        this._zNear = value;
        this.updateValues();
    }
    get zNear() {
        return this._zNear;
    }
    set zFar(value: number) {
        this._zFar = value;
        this.updateValues();
    }
    get zFar() {
        return this._zFar;
    }
    set aspect(value: number) {
        this._aspect = value;
        this.updateValues();
    }
    get aspect() {
        return this._aspect;
    }
    set cameraRotation(value: Vector3) {
        this._cameraRotation = value;
        this.updateValues();
    }
    get cameraRotation() {
        return this._cameraRotation;
    }
    set cameraTranslation(value: Vector3) {
        this._cameraTranslation = value;
        this.updateValues();
    }
    get cameraTranslation() {
        return this._cameraTranslation;
    }
    add(obj: Primitive) {
        this.objectList.set(obj.uuid, obj);
    }
    remove(objectId: string) {
        this.objectList.delete(objectId);
    }

}

class Cube extends Primitive {
    constructor(world: World, vertexShaderUrl: string, fragmentShaderUrl: string, texture: WebGLTexture, reflectivity: number, translation: Vector3 = Vector3.null, scale: Vector3 = new Vector3(1, 1, 1), rotation: Vector3 = Vector3.null) {
        super(
            [
                // Face avant
                new Vector3(-1.0, -1.0, 1.0),
                new Vector3(1.0, -1.0, 1.0),
                new Vector3(1.0, 1.0, 1.0),
                new Vector3(-1.0, 1.0, 1.0),

                // Face arrière
                new Vector3(-1.0, -1.0, -1.0),
                new Vector3(-1.0, 1.0, -1.0),
                new Vector3(1.0, 1.0, -1.0),
                new Vector3(1.0, -1.0, -1.0),

                // Face supérieure
                new Vector3(-1.0, 1.0, -1.0),
                new Vector3(-1.0, 1.0, 1.0),
                new Vector3(1.0, 1.0, 1.0),
                new Vector3(1.0, 1.0, -1.0),

                // Face inférieure
                new Vector3(-1.0, -1.0, -1.0),
                new Vector3(1.0, -1.0, -1.0),
                new Vector3(1.0, -1.0, 1.0),
                new Vector3(-1.0, -1.0, 1.0),

                // Face droite
                new Vector3(1.0, -1.0, -1.0),
                new Vector3(1.0, 1.0, -1.0),
                new Vector3(1.0, 1.0, 1.0),
                new Vector3(1.0, -1.0, 1.0),

                // Face gauche
                new Vector3(-1.0, -1.0, -1.0),
                new Vector3(-1.0, -1.0, 1.0),
                new Vector3(-1.0, 1.0, 1.0),
                new Vector3(-1.0, 1.0, -1.0)
            ],
            [
                [0, 1, 2], [0, 2, 3],
                [4, 5, 6], [4, 6, 7],
                [8, 9, 10], [8, 10, 11],
                [12, 13, 14], [12, 14, 15],
                [16, 17, 18], [16, 18, 19],
                [20, 21, 22], [20, 22, 23]
            ],
            [
                // Front
                new Vector3(0.0, 0.0, 1.0),
                new Vector3(0.0, 0.0, 1.0),
                new Vector3(0.0, 0.0, 1.0),
                new Vector3(0.0, 0.0, 1.0),

                // Back
                new Vector3(0.0, 0.0, -1.0),
                new Vector3(0.0, 0.0, -1.0),
                new Vector3(0.0, 0.0, -1.0),
                new Vector3(0.0, 0.0, -1.0),

                // Top
                new Vector3(0.0, 1.0, 0.0),
                new Vector3(0.0, 1.0, 0.0),
                new Vector3(0.0, 1.0, 0.0),
                new Vector3(0.0, 1.0, 0.0),

                // Bottom
                new Vector3(0.0, -1.0, 0.0),
                new Vector3(0.0, -1.0, 0.0),
                new Vector3(0.0, -1.0, 0.0),
                new Vector3(0.0, -1.0, 0.0),

                // Right
                new Vector3(1.0, 0.0, 0.0),
                new Vector3(1.0, 0.0, 0.0),
                new Vector3(1.0, 0.0, 0.0),
                new Vector3(1.0, 0.0, 0.0),

                // Left
                new Vector3(-1.0, 0.0, 0.0),
                new Vector3(-1.0, 0.0, 0.0),
                new Vector3(-1.0, 0.0, 0.0),
                new Vector3(-1.0, 0.0, 0.0),
            ],
            world,
            vertexShaderUrl,
            fragmentShaderUrl,
            [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],

                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],

                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],

                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],

                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],

                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
            ],
            texture,
            reflectivity,
            translation,
            scale,
            rotation
        );
    }
}

class Plane extends Primitive {
    constructor(world: World, vertexShaderUrl: string, fragmentShaderUrl: string, texture: WebGLTexture, reflectivity: number, translation: Vector3 = Vector3.null, scale: Vector3 = new Vector3(1, 1, 1), rotation: Vector3 = Vector3.null) {
        super(
            [
                new Vector3(-1.0, 1.0, -1.0),
                new Vector3(-1.0, 1.0, 1.0),
                new Vector3(1.0, 1.0, 1.0),
                new Vector3(1.0, 1.0, -1.0),
            ],
            [
                [0, 1, 2], [0, 2, 3]
            ],
            [
                new Vector3(0.0, 1.0, 0.0),
                new Vector3(0.0, 1.0, 0.0),
                new Vector3(0.0, 1.0, 0.0),
                new Vector3(0.0, 1.0, 0.0),
            ],
            world,
            vertexShaderUrl,
            fragmentShaderUrl,
            [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1]
            ],
            texture,
            reflectivity,
            translation,
            scale,
            rotation
        );
    }
}
class UIPlane extends Plane {
    x: number;
    y: number;
    dy: number;
    dx: number;
    constructor(x: number, y: number, dx: number, dy: number, texture: WebGLTexture, world: World, vertexShaderUrl: string, fragmentShaderUrl: string) {
        super(world, vertexShaderUrl, fragmentShaderUrl, texture, 0);
        this.x = x;
        this.y = y;
        this.dx = dy;
        this.dy = dx;
        this.attributes = [
            "aVertexPosition",
            "aTextureCoord",
        ];
        this.uniforms = [
            "uSampler",
        ];
        this.bufferData = {
            attributes: [],
            customAttributes: [],
            uniforms: [
                { method: UniformTypes.uniform1i, location: 0, value: thisObj => [0] },
            ],
            indexs: <WebGLBuffer>this.gl.createBuffer(),
            indexsLength: 0
        }
        this.updateBuffers();
    }
    initBuffer() {
        const { gl } = this;
        // a few conversion to turn the values that range from
        // x: 0 to canvas width
        // y: 0 to canvas height
        // to
        // x: -1 to 1
        // y: -1 to 1
        const [x, y] = [this.x / (gl.canvas.width / 2) - 1, this.y / (gl.canvas.height / 2) - 1];
        const [dx, dy] = [this.dx / (gl.canvas.width / 2) - 1, this.dy / (gl.canvas.height / 2) - 1]
        const pos = createBuffer(gl, "position");
        gl.bindBuffer(gl.ARRAY_BUFFER, pos);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            x, y,
            dx, y,
            dx, dy,
            x, dy
        ]), gl.STATIC_DRAW);
        const res = super.initBuffer();
        res.attributes.pop();
        res.attributes[0] = {
            comp: 2,
            location: 0,
            value: pos
        }
        return res;
    }
}

type ambiantLight = N3;

interface dirrectionalLight {
    dirrection: Vector3,
    color: N3
}

interface PointLight {
    position: Vector3,
    color: N3
}


export default {
    World: World,
    Primitive: Primitive,
    Cube: Cube,
    Plane: Plane,
    UIPlane: UIPlane
}
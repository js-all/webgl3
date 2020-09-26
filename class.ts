import { mat4, vec4, vec3 } from 'gl-matrix'
import { v4 as uuidV4 } from 'uuid';
import { createBuffer, initShaderProgram, fetchShaders, rad } from './utils'

type N3 = [number, number, number];
interface Mesh {
    points: vec3[],
    tris: N3[],
    normals: vec3[]
}

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
    points: vec3[];
    tris: N3[];
    normals: vec3[];
    private ready: boolean = false;
    world: World;
    uuid: string = uuidV4();
    scale: vec3;
    translation: vec3;
    rotation: vec3;
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
        "uExponant", // 11
        "uLightFac" // 12
    ];
    reflectivity: number;
    attributesLocations: number[] = [];
    uniformsLocations: WebGLUniformLocation[] = [];
    bufferData: BufferData;
    /**
     * so for some reason when "computing" the points (applying
     * model view and projection matrix) on the cpu side, the x
     * and z rotations axis needs to be inverted, otherwise the
     * verticies becomes wrong.
     * 
     * so i created this property to cache the matrix and avoid
     * recomputing when its not needed.
     */
    /**
     * nvm im dumb i think, im not sure but its proably caused by the canvas overlay that has x and y flipped
     */
    modelMatrixRotationFix: mat4 = mat4.create();
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
    lightAmbiantFac = 1;
    lightDirDifuseFac = 1;
    lightPointDiffuseFac = 1;
    lightPointSpecularFac = 1;
    /**
     * new Primitive
     * @param points the points of the shape
     * @param tris the faces
     * @param normals the normal, use null for them to be procedurally computed
     * @param world the wolrd Ovject that element will be in
     * @param vertexShaderUrl the url to the vertexShader
     * @param fragmentShaderUrl the url to the Fragment Shader
     * @param textureCoordinates the texture coordinates
     * @param texture the webglTexture
     * @param reflectivity how reflectif the object is 0 - 1
     * @param translation the translation
     * @param scale the scale
     * @param rotation the rotation
     */
    constructor(points: vec3[], tris: N3[], normals: vec3[] | null, world: World, vertexShaderUrl: string, fragmentShaderUrl: string, textureCoordinates: [number, number][], texture: WebGLTexture, reflectivity: number, translation: vec3 = [0, 0, 0], scale: vec3 = [1, 1, 1], rotation: vec3 = [0, 0, 0]) {
        this.world = world;
        this.bufferData = {
            attributes: [],
            customAttributes: [],
            uniforms: [
                { method: UniformTypes.uniformMatrix4fv, location: 0, value: thisObj => [thisObj.world.projectionMatrix] },
                { method: UniformTypes.uniformMatrix4fv, location: 1, value: thisObj => [thisObj.modelViewMatrix] },
                { method: UniformTypes.uniform1i, location: 2, value: thisObj => [0] },
                { method: UniformTypes.uniformMatrix4fv, location: 3, value: thisObj => { const out = mat4.invert(mat4.create(), thisObj.modelViewMatrix); mat4.transpose(out, out); return [out] } },
                { method: UniformTypes.uniform3fv, location: 4, value: thisObj => [thisObj.world.ambiantLight] },
                { method: UniformTypes.uniform3fv, location: 5, value: thisObj => { const res: number[] = []; thisObj.directionalLights.map(v => res.push(...v.color)); while (res.length < Primitive.MAX_LIGHTS) { res.push(0, 0, 0) }; return [res] } },
                { method: UniformTypes.uniform3fv, location: 6, value: thisObj => { const res: number[] = []; thisObj.directionalLights.map(v => res.push(...v.dirrection)); while (res.length < Primitive.MAX_LIGHTS) { res.push(0, 0, 0) }; return [res] } },
                { method: UniformTypes.uniformMatrix4fv, location: 7, value: thisObj => [thisObj.world.viewRotationMatrix] },
                { method: UniformTypes.uniform3fv, location: 8, value: thisObj => { const res: number[] = []; thisObj.movedPointLights.map(v => res.push(...v.position)); while (res.length < Primitive.MAX_LIGHTS) { res.push(0, 0, 0) }; return [res] } },
                { method: UniformTypes.uniform3fv, location: 9, value: thisObj => { const res: number[] = []; thisObj.pointLights.map(v => res.push(...v.color)); while (res.length < Primitive.MAX_LIGHTS) { res.push(0, 0, 0) }; return [res] } },
                { method: UniformTypes.uniform1f, location: 10, value: thisObj => [thisObj.reflectivity] },
                { method: UniformTypes.uniform1i, location: 11, value: thisObj => [thisObj.exponant] },
                { method: UniformTypes.uniform4fv, location: 12, value: thisObj => [[thisObj.lightAmbiantFac, thisObj.lightDirDifuseFac, thisObj.lightPointDiffuseFac, thisObj.lightPointSpecularFac]] }
            ],
            indexs: <WebGLBuffer>this.gl.createBuffer(),
            indexsLength: 0
        }
        this.reflectivity = reflectivity;
        this.points = points;
        this.tris = tris;
        this.normals = normals === null ? this.computeNormals() : normals;
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
     * compute the normals automatically, probably doesn't work using two triangles orientation
     */
    computeNormals(): vec3[] {
        const res: vec3[] = <vec3[]>(new Array(this.points.length).fill([0, 0, 0]))
        for (let i of this.tris) {
            // just to be able to copy what told on stackoverflow im desparate here
            // https://stackoverflow.com/questions/29488574/how-to-calculate-normals-for-an-Icosphere/44351078
            const v = (v: number) => this.points[i[v - 1]];
            const p12 = vec3.subtract(vec3.create(), v(2), v(1));
            const p23 = vec3.subtract(vec3.create(), v(3), v(2));
            const n = vec3.cross(vec3.create(), p12, p23);
            const l = vec3.len(n);
            vec3.div(n, n, vec3.fromValues(l, l, l));
            res[i[0]] = n;
            res[i[1]] = n;
            res[i[2]] = n;
        }
        return res;
    }
    /**
     * called to update the model matrix or by the world to update modelViewMatrix
     * @param worldCall set to false by default only true when called from the world object for performance reason, no point in setting to true manually
     */
    updateMatricies(worldCall = false) {
        this.modelMatrix = mat4.create();
        mat4.identity(this.modelMatrix);
        mat4.translate(this.modelMatrix, this.modelMatrix, this.translation);
        this.modelMatrixRotationFix = mat4.clone(this.modelMatrix);
        mat4.rotate(this.modelMatrix, this.modelMatrix, this.rotation[0], [1, 0, 0]);
        mat4.rotate(this.modelMatrix, this.modelMatrix, this.rotation[1], [0, 1, 0]);
        mat4.rotate(this.modelMatrix, this.modelMatrix, this.rotation[2], [0, 0, 1]);
        mat4.scale(this.modelMatrix, this.modelMatrix, this.scale);
        mat4.rotate(this.modelMatrixRotationFix, this.modelMatrixRotationFix, this.rotation[0], [-1, 0, 0]); // inverted X
        mat4.rotate(this.modelMatrixRotationFix, this.modelMatrixRotationFix, this.rotation[1], [0, 1, 0]);  // ok there im confused, on a project you need the y inverted and on the other you don't so fuck it
        mat4.rotate(this.modelMatrixRotationFix, this.modelMatrixRotationFix, this.rotation[2], [0, 0, -1]); // and Z
        mat4.scale(this.modelMatrixRotationFix, this.modelMatrixRotationFix, this.scale);
        this.modelViewMatrix = mat4.create();
        mat4.multiply(this.modelViewMatrix, this.world.viewMatrix, this.modelMatrix);
        if (worldCall) {
            this.pointLights = this.world.pointLights;
            this.directionalLights = this.world.directionalLights;
            const res: PointLight[] = [];
            for (let i of this.pointLights) {
                res.push({
                    color: i.color,
                    position: vec3.fromValues(...<N3>vec4.transformMat4(vec4.create(), vec4.fromValues(i.position[0], i.position[1], i.position[2], 1), this.world.viewMatrix).filter((v: number, i: number) => i < 3))
                })
            }
            this.movedPointLights = res;
        }
    }
    /**
     * get webglContext
     */
    get gl() {
        return this.world.gl;
    }
    /**
     * merge the verticies and normals,
     * can be used to achieve smooth shading
     */
    mergeVerticies() {
        return this.setMesh(Primitive.generateMergedVerticiesMesh(this.getMesh()));
    }
    /**
     * return the mesh object representing the points of the Primitive
     */
    getMesh(): Mesh {
        return {
            normals: this.normals,
            points: this.points,
            tris: this.tris
        }
    }
    /**
     * change the mesh
     * @param mesh the mesh to set as the new one
     */
    setMesh(mesh: Mesh) {
        this.points = mesh.points;
        this.tris = mesh.tris;
        this.normals = mesh.normals;
        this.updateBuffers();
    }
    /**
     * merge the vertices tris and normals of a mesh
     */
    static generateMergedVerticiesMesh(mesh: Mesh): Mesh {
        // method to use string as keys rather than the arrays themselve
        // because it would end with multiple key with the same value
        const stringify = (input: vec3) => input.join(' ');
        const fromString = (input: string) => input.split(' ').map(v => parseFloat(v)) as vec3;
        // spread the input data and define the output
        const { normals, points, tris } = mesh;
        const resNorms: typeof normals = [];
        const resPoints: typeof points = [];
        const resTris: typeof tris = [...tris];
        // a map with the coords of the point (a single one because they all are the same)
        // as a key and the ids of the points as value
        const dupedPoints: Map<string, number[]> = new Map();
        // to edit the multples old points ids
        // into a single new one
        const redacted = (newId: number, ...oldID: number[]) => {
            // loop a lot as this method is only run once at startup
            // (if its even ran at all)
            for(let i = 0; i < resTris.length; i++) {
                for(let j = 0; j < 3; j++) {
                    for(let k of oldID) {
                        if(k === resTris[i][j]){
                            resTris[i][j] = newId;
                        }
                    }
                }
            }
        }
        // fill the map with the right values
        for(let i = 0; i < points.length; i++) {
            // get the stringified key because of reasons mentionned above
            const p = stringify(points[i]);
            if (!dupedPoints.has(p)) {
                dupedPoints.set(p, [i]);
            } else {
                dupedPoints.set(p, (<number[]>dupedPoints.get(p)).concat(i));
            }
        }
        dupedPoints.forEach((v, k) => {
            // get back the stringified key
            const vec = fromString(k);
            // get the normal of every points
            const norms = v.map(v => normals[v]);
            const resNorm = norms[0];
            // TODO: FIX THIS SHIT
            // compute the unified normal
            for(let i = 1; i < norms.length; i++) {
                vec3.lerp(resNorm, resNorm, norms[i], 1/norms.length);
            }
            // push the results
            resPoints.push(vec);
            resNorms.push(resNorm);
            redacted(resPoints.length-1, ...v);
        });
        // and return
        return {
            points: resPoints,
            normals: resNorms,
            tris: resTris
        }
    }
    /**
     * get the 2d bonding box of the element
     * i would have liked to to it in a shader to avoid computing matricies multiplication on the cpu that much
     * but i don't want to use more than one passes so i'll do it this way
     */
    get2dScreenBoundingBox() {
        const transformedVerticiesX: number[] = [];
        const transformedVerticiesY: number[] = [];
        for (let v of this.points) {
            const proj = this.computeProjectedPosition(v);
            // if w <= 0 the its offscreen
            if (proj[3] <= 0) continue;
            transformedVerticiesX.push(proj[0]);
            transformedVerticiesY.push(proj[1]);
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
    /**
     * compute the projected, 2d location of a vertex
     * @param vertex 
     */
    computeProjectedPosition(vertex: vec3) {
        const vec = vec4.fromValues(vertex[0], vertex[1], vertex[2], 1);
        vec4.transformMat4(vec, vec, this.modelMatrixRotationFix);
        vec4.transformMat4(vec, vec, this.world.viewMatrix);
        vec4.transformMat4(vec, vec, this.world.projectionMatrix);
        const w = vec[3];
        const dVec = vec.map((v: number) => v / w);
        dVec[3] = w;
        return <vec4>dVec
    }
    // get the 3d bounding box of the pirmitive
    get3dBoundingBox() {
        const Ys: number[] = [];
        const Xs: number[] = [];
        const Zs: number[] = [];
        for (let i of this.points) {
            const transformedVerticie = vec3.transformMat4(vec3.create(), i, this.modelMatrix);
            Xs.push(transformedVerticie[0]);
            Ys.push(transformedVerticie[1]);
            Zs.push(transformedVerticie[2]);
        }
        const min: vec3 = vec3.fromValues(Math.min(...Xs), Math.min(...Ys), Math.min(...Zs));
        const max: vec3 = vec3.fromValues(Math.max(...Xs), Math.max(...Ys), Math.max(...Zs));
        return {
            min: min,
            max: max
        }
    }
    // generate the attributes passed to the shader from the vertices and other properties
    initBuffer(): BufferData {
        const { gl } = this;

        const positions: number[] = [];
        const PBuffer = createBuffer(gl, "position");
        this.points.forEach(v => positions.push(...v));
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
        this.normals.forEach(v => normals.push(...v));
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
    // get the location of the uniforms and attribute to pass to the webgl shader
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
    private _cameraRotation: vec3;
    private _cameraTranslation: vec3;
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
            gl.clearColor(255, 255, 255, 1);
            gl.clearDepth(1);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.enable(gl.BLEND);
            //gl.enable(gl.CULL_FACE);
            //gl.cullFace(gl.BACK);
        },
        gl => {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
    ];
    // to fix lightning not rotating with the camera
    viewRotationMatrix: mat4 = mat4.create();
    constructor(fov: number, zNear: number, zFar: number, gl: WebGLRenderingContext, cameraRotation: vec3, cameraTranslation: vec3, ambiantLight?: ambiantLight, directionalLights: dirrectionalLight[] = [], pointLights: PointLight[] = []) {
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
        //! vec3.inverse turn a [0 , 0, 0] vector to [Infinity, Infinity, Infinity]
        const reverseCTrans = vec3.mul(vec3.create(), this.cameraTranslation, [-1, -1, -1]);
        const reverseCRot = vec3.mul(vec3.create(), this.cameraRotation, [-1, -1, -1]);
        mat4.perspective(this.projectionMatrix, this.fov, this.aspect, this.zNear, this.zFar);
        this.viewRotationMatrix = mat4.create();
        this.viewMatrix = mat4.create();
        mat4.identity(this.viewRotationMatrix);
        mat4.rotateX(this.viewRotationMatrix, this.viewRotationMatrix, reverseCRot[0]);
        mat4.rotateY(this.viewRotationMatrix, this.viewRotationMatrix, reverseCRot[1]);
        mat4.rotateZ(this.viewRotationMatrix, this.viewRotationMatrix, reverseCRot[2]);
        mat4.identity(this.viewMatrix);
        mat4.translate(this.viewMatrix, this.viewMatrix, reverseCTrans);
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
    set cameraRotation(value: vec3) {
        this._cameraRotation = value;
        this.updateValues();
    }
    get cameraRotation() {
        return this._cameraRotation;
    }
    set cameraTranslation(value: vec3) {
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
    constructor(world: World, vertexShaderUrl: string, fragmentShaderUrl: string, texture: WebGLTexture, reflectivity: number, translation: vec3 = [0, 0, 0], scale: vec3 = [1, 1, 1], rotation: vec3 = [0, 0, 0]) {
        super(
            [
                // Face avant
                vec3.fromValues(-1.0, -1.0, 1.0),
                vec3.fromValues(1.0, -1.0, 1.0),
                vec3.fromValues(1.0, 1.0, 1.0),
                vec3.fromValues(-1.0, 1.0, 1.0),

                // Face arrière
                vec3.fromValues(-1.0, -1.0, -1.0),
                vec3.fromValues(-1.0, 1.0, -1.0),
                vec3.fromValues(1.0, 1.0, -1.0),
                vec3.fromValues(1.0, -1.0, -1.0),

                // Face supérieure
                vec3.fromValues(-1.0, 1.0, -1.0),
                vec3.fromValues(-1.0, 1.0, 1.0),
                vec3.fromValues(1.0, 1.0, 1.0),
                vec3.fromValues(1.0, 1.0, -1.0),

                // Face inférieure
                vec3.fromValues(-1.0, -1.0, -1.0),
                vec3.fromValues(1.0, -1.0, -1.0),
                vec3.fromValues(1.0, -1.0, 1.0),
                vec3.fromValues(-1.0, -1.0, 1.0),

                // Face droite
                vec3.fromValues(1.0, -1.0, -1.0),
                vec3.fromValues(1.0, 1.0, -1.0),
                vec3.fromValues(1.0, 1.0, 1.0),
                vec3.fromValues(1.0, -1.0, 1.0),

                // Face gauche
                vec3.fromValues(-1.0, -1.0, -1.0),
                vec3.fromValues(-1.0, -1.0, 1.0),
                vec3.fromValues(-1.0, 1.0, 1.0),
                vec3.fromValues(-1.0, 1.0, -1.0)
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
                vec3.fromValues(0.0, 0.0, 1.0),
                vec3.fromValues(0.0, 0.0, 1.0),
                vec3.fromValues(0.0, 0.0, 1.0),
                vec3.fromValues(0.0, 0.0, 1.0),

                // Back
                vec3.fromValues(0.0, 0.0, -1.0),
                vec3.fromValues(0.0, 0.0, -1.0),
                vec3.fromValues(0.0, 0.0, -1.0),
                vec3.fromValues(0.0, 0.0, -1.0),

                // Top
                vec3.fromValues(0.0, 1.0, 0.0),
                vec3.fromValues(0.0, 1.0, 0.0),
                vec3.fromValues(0.0, 1.0, 0.0),
                vec3.fromValues(0.0, 1.0, 0.0),

                // Bottom
                vec3.fromValues(0.0, -1.0, 0.0),
                vec3.fromValues(0.0, -1.0, 0.0),
                vec3.fromValues(0.0, -1.0, 0.0),
                vec3.fromValues(0.0, -1.0, 0.0),

                // Right
                vec3.fromValues(1.0, 0.0, 0.0),
                vec3.fromValues(1.0, 0.0, 0.0),
                vec3.fromValues(1.0, 0.0, 0.0),
                vec3.fromValues(1.0, 0.0, 0.0),

                // Left
                vec3.fromValues(-1.0, 0.0, 0.0),
                vec3.fromValues(-1.0, 0.0, 0.0),
                vec3.fromValues(-1.0, 0.0, 0.0),
                vec3.fromValues(-1.0, 0.0, 0.0),
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
    constructor(world: World, vertexShaderUrl: string, fragmentShaderUrl: string, texture: WebGLTexture, reflectivity: number, translation: vec3 = [0, 0, 0], scale: vec3 = [1, 1, 1], rotation: vec3 = [0, 0, 0]) {
        super(
            [
                vec3.fromValues(-1.0, 1.0, -1.0),
                vec3.fromValues(-1.0, 1.0, 1.0),
                vec3.fromValues(1.0, 1.0, 1.0),
                vec3.fromValues(1.0, 1.0, -1.0),
            ],
            [
                [0, 1, 2], [0, 2, 3]
            ],
            [
                vec3.fromValues(0.0, 1.0, 0.0),
                vec3.fromValues(0.0, 1.0, 0.0),
                vec3.fromValues(0.0, 1.0, 0.0),
                vec3.fromValues(0.0, 1.0, 0.0),
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

class Icosphere extends Primitive {
    // just to avoid computing it everytime
    private static phi = (1 + Math.sqrt(5)) / 2;
    constructor(world: World, dupeVert: boolean, vertexShaderUrl: string, fragmentShaderUrl: string, refinement: number, texture: WebGLTexture, reflectivity: number, translation: vec3 = [0, 0, 0], scale: vec3 = [1, 1, 1], rotation: vec3 = [0, 0, 0]) {
        const h = 1;
        const l = Icosphere.phi * h;
        const t: [number, number][] = [];
        // thanks stackoverflow !
        var packedTrisPoints: [vec3, vec3, vec3][] =
            normalizePackedTriVecArray([
                [[-h, l, 0], [0, h, l], [h, l, 0]],
                [[h, l, 0], [0, h, -l], [-h, l, 0]],
                [[h, l, 0], [0, h, l], [l, 0, h]],
                [[h, l, 0], [l, 0, -h], [0, h, -l]],
                [[l, 0, -h], [h, l, 0], [l, 0, h]],
                [[-h, -l, 0], [h, -l, 0], [0, -h, l]],
                [[-h, -l, 0], [0, -h, -l], [h, -l, 0]],
                [[-h, -l, 0], [0, -h, l], [-l, 0, h]],
                [[-h, -l, 0], [-l, 0, -h], [0, -h, -l]],
                [[-l, 0, h], [-l, 0, -h], [-h, -l, 0]],
                [[-h, l, 0], [-l, 0, h], [0, h, l]],
                [[-h, l, 0], [0, h, -l], [-l, 0, -h]],
                [[-h, l, 0], [-l, 0, -h], [-l, 0, h]],
                [[h, -l, 0], [l, 0, h], [0, -h, l]],
                [[h, -l, 0], [0, -h, -l], [l, 0, -h]],
                [[h, -l, 0], [l, 0, -h], [l, 0, h]],
                [[0, -h, -l], [-l, 0, -h], [0, h, -l]],
                [[0, -h, -l], [0, h, -l], [l, 0, -h]],
                [[0, h, l], [-l, 0, h], [0, -h, l]],
                [[0, h, l], [0, -h, l], [l, 0, h]]

            ]);
        for (let c of new Array(refinement)) {
            const res: [vec3, vec3, vec3][] = [];
            for (let i of packedTrisPoints) {
                const halfway = (po: vec3, pd: vec3) => {
                    const res = vec3.create();
                    vec3.subtract(res, pd, po);
                    vec3.mul(res, res, [.5, .5, .5]);
                    vec3.add(res, po, res);
                    // set length to one so the vector lies on the unit sphere
                    vec3.normalize(res, res);
                    return res;
                };
                // compute the points
                const [p1, p2, p3] = i;
                const [p4, p5, p6] = [halfway(p1, p2), halfway(p2, p3), halfway(p3, p1)];
                // create the triangles
                const tris: [vec3, vec3, vec3][] = [
                    [p1, p4, p6],
                    [p4, p2, p5],
                    [p6, p5, p3],
                    [p4, p5, p6]
                ]
                res.push(...tris);
            }
            packedTrisPoints = res;
        }
        const { tris, points } = unpackTriVecArray(packedTrisPoints);
        for (let i of new Array(packedTrisPoints.length)) {
            t.push([0, 0],
                [1, 0],
                [1, 1],
                [0, 1]);
        }
        super(
            points,
            tris,
            null,
            world,
            vertexShaderUrl,
            fragmentShaderUrl,
            t,
            texture,
            reflectivity,
            translation,
            scale,
            rotation
        );
    }
}

type ambiantLight = N3;

interface dirrectionalLight {
    dirrection: vec3,
    color: N3
}

interface PointLight {
    position: vec3,
    color: N3
}

function unpackTriVecArray(arr: [vec3, vec3, vec3][]) {
    const tris: N3[] = [];
    const points: vec3[] = [];
    for (let i of arr) {
        points.push(...i);
        tris.push([points.length - 3, points.length - 2, points.length - 1]);
    }
    return {
        tris: tris,
        points: points
    }
}

function normalizePackedTriVecArray(arr: [vec3, vec3, vec3][]) {
    const res: [vec3, vec3, vec3][] = [];
    for (let i of arr) {
        res.push([
            vec3.normalize(vec3.create(), i[0]),
            vec3.normalize(vec3.create(), i[1]),
            vec3.normalize(vec3.create(), i[2])
        ]);
    }
    return res;
}
type g = Primitive;
export {
    World,
    Primitive,
    Cube,
    Plane,
    UIPlane,
    Icosphere,
    unpackTriVecArray

}

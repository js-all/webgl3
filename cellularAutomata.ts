import rh from './resize'
import { Primitive, World, UIPlane, unpackTriVecArray, Cube } from './class'
import { mat4, vec3, vec4 } from 'gl-matrix'
import { rad, deg, createTextureFromColor, loadTexture, createTextureFromCanvas } from './utils'
import triangulation from './triangulations'

const canvas = <HTMLCanvasElement>document.createElement('canvas');
const cw: number = 1000;
const ch: number = 1000;
const mw = 50;
const mh = 50;
const mt = 50;
// -4 to be sure
const MAX_TRIS = 65536 - 4;
const random = 1;
let map: map<boolean> = [];
type map<T> = T[][][]
const conversionTreshold = 16;

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
const sensibility = .5;
const KeysDown: Set<number> = new Set();

const world = new World(rad(45), .1, 1000, gl, [rad(-0), rad(0), rad(0)], [0, 0, 0], [.2, .2, .2], [{ color: [.2, .2, .2], dirrection: [-1, -1, 0] }], [{
    color: [.5, .5, .5],
    position: [0, 0, 0]
}]);
document.body.appendChild(canvas)
let i = 0;
world.aspect = cw / ch;

function fillMapWithRandomValues(map: map<any>, val1: any = true, val2: any = false) {
    map = new Array(mw).fill(0).map(v => new Array(mh).fill(0).map(b => new Array(mt).fill(0).map(n => Math.random() < random ? val1 : val2)));
    return map;
}

function fillMapWithEmptyValues(val: any = false) {
    const res = new Array(mw).fill(new Array(mh).fill(new Array(mt).fill(val)));
    return res;
}

const mesh: Primitive[] = [];
map = fillMapWithRandomValues(map);
map = refineMap(map, 20);
function refineMap(map: map<any>, iteration: number) {
    const xo = 1;
    const yo = 1;
    const zo = 1;
    // repeat iteration time for smoother result
    for (let _i of new Array(iteration)) {
        const res: map<boolean> = [];
        // loop through every cell
        for (let x = 0; x < mw; x++) {
            res.push([]);
            for (let y = 0; y < mh; y++) {
                res[x].push([])
                for (let z = 0; z < mt; z++) {

                    let wallNeighboursCount = 0;
                    const plsBeSync = loopTroughNeigbours(map, x, y, z, xo, yo, zo, (v, a, b, c, exist) => (v || !true) && wallNeighboursCount++);
                    res[x][y].push(map[x][y][z] ? (wallNeighboursCount >= 13 + plsBeSync ? true : false) : (wallNeighboursCount <= 19 && wallNeighboursCount >= 13 ? true : false));
                }
            }
        }
        map = [...res];
    }
    return map;
}
function updateMesh() {
    const l = 1;
    const texture = loadTexture(gl, "/img/stone.png");
    const resMesh: [vec3, vec3, vec3][] = [];
    // -1 and <= because the marched mesh is bigger than the cell number essentialy (sry im bad at explaining)
    for (let x = -1; x <= mw; x++) {
        for (let y = -1; y <= mh; y++) {
            for (let z = -1; z <= mt; z++) {
                const gfm = (x: number, y: number, z: number) => ((x < 0 || x >= mw) || (y < 0 || y >= mh) || (z < 0 || z >= mt)) ? false : map[x * -1 + (mw - 1)][y][z];
                const [
                    corner000,
                    corner100,
                    corner010,
                    corner110,
                    corner001,
                    corner101,
                    corner011,
                    corner111
                ] = [
                        gfm(x + 0, y + 0, z + 0),
                        gfm(x + 1, y + 0, z + 0),
                        gfm(x + 0, y + 1, z + 0),
                        gfm(x + 1, y + 1, z + 0),
                        gfm(x + 0, y + 0, z + 1),
                        gfm(x + 1, y + 0, z + 1),
                        gfm(x + 0, y + 1, z + 1),
                        gfm(x + 1, y + 1, z + 1)
                    ];
                const n = (n: boolean) => n ? "1" : "0";
                type edge = [number, number]
                let idString = "";
                idString += n(corner111);
                idString += n(corner011);
                idString += n(corner101);
                idString += n(corner001);
                idString += n(corner110);
                idString += n(corner010);
                idString += n(corner100);
                idString += n(corner000);
                // just create a number representing the disposition of point with value true
                const id = parseInt(idString, 2);
                const resTris = <[vec3, vec3, vec3][]>(<[edge, edge, edge][]>triangulation.triangles[id].map(t => t.map(ei => triangulation.edges[ei]))).map(t2 => t2.map(v => {
                    // subtract .5 to center the verticies
                    const vert = triangulation.verticies.map(v2 => vec3.add(vec3.create(), v2, [-.5, -.5, -.5]))
                    const p1 = vert[v[0]];
                    const p2 = vert[v[1]];

                    const midPoint = vec3.create();
                    // get the vector going from p1 to p2
                    vec3.subtract(midPoint, p2, p1);
                    // divide it by 2
                    vec3.multiply(midPoint, midPoint, [.5, .5, .5]);
                    // add it back to get the midpoint between p1 and p2
                    vec3.add(midPoint, p1, midPoint);
                    // multiply by l to have the right lengths
                    vec3.multiply(midPoint, midPoint, [l, l, l]);
                    // initialize posp1 as the position plus 1 because it start at -1
                    const posp1 = vec3.add(vec3.create(), [x, y, z], [1, 1, 1])
                    // multiply it by l to have the size be applied
                    vec3.multiply(posp1, posp1, [l, l, l]);
                    // and add the position to the mid point to offset it
                    vec3.add(midPoint, midPoint, posp1);
                    return midPoint;
                }));
                resMesh.push(...resTris);
            }
        }
    }
    const packedMeshs: [vec3, vec3, vec3][][] = [];
    let trisn = 0;
    const t: [number, number][][] = [[]];
    const tmpArr: [vec3, vec3, vec3][] = [];
    while (resMesh.length > 0) {
        if (trisn >= MAX_TRIS) {
            packedMeshs.push(tmpArr.splice(0, tmpArr.length));
            trisn = 0;
            t.push([]);
        }
        tmpArr.push(<[vec3, vec3, vec3]>resMesh.shift());
        trisn += 3;
        t[t.length - 1].push([0, 0],
            [1, 0],
            [1, 1],
            [0, 1]);
    }
    packedMeshs.push(tmpArr.splice(0, tmpArr.length));
    for (let i = 0; i < packedMeshs.length; i++) {
        const { points, tris } = unpackTriVecArray(packedMeshs[i]);
        const textureCoordinates = t[i];
        mesh.push(new Primitive(points, tris, null, world, shaders.vert, shaders.frag, textureCoordinates, texture, .5))
    }
    console.log(mesh)
}

function loopTroughNeigbours(map: map<boolean>, x: number, y: number, z: number, xo: number, yo: number, zo: number, cb: (v: boolean, nx: number, ny: number, nz: number, exist: boolean) => any) {
    let n = 0;
    for (let nx = x - xo; nx <= x + xo; nx++) {
        for (let ny = y - yo; ny <= y + yo; ny++) {
            for (let nz = z - zo; nz <= z + zo; nz++) {
                // avoid counting itself
                if (nx === x && ny === y && nz === z) continue;
                n++;
                if (nx < 0 || ny < 0 || nz < 0 || nx >= mw || ny >= mh || nz >= mt) {
                    cb(false, nx, ny, nz, false);
                    continue;
                }
                cb(map[nx][ny][nz], nx, ny, nz, true);
            }
        }
    }
    return 0;
}
//updateMesh();
{
    const code = parseInt(prompt("yea yk") ?? '0', 2);
    const resTris = <[vec3, vec3, vec3][]>(<[[number, number], [number, number], [number, number]][]>triangulation.triangles[isNaN(code) ? 0 : code].map(t => t.map(ei => triangulation.edges[ei]))).map(t2 => t2.map(v => {
        // subtract .5 to center the verticies
        const vert = triangulation.verticies.map(v2 => vec3.add(vec3.create(), v2, [1, 1, 1]))
        const p1 = vert[v[0]];
        const p2 = vert[v[1]];
        const l = 1;
        const midPoint = vec3.create();
        // get the vector going from p1 to p2
        vec3.subtract(midPoint, p2, p1);
        // divide it by 2
        vec3.multiply(midPoint, midPoint, [.5, .5, .5]);
        // add it back to get the midpoint between p1 and p2
        vec3.add(midPoint, p1, midPoint);
        // multiply by l to have the right lengths
        vec3.multiply(midPoint, midPoint, [l, l, l]);
        // initialize posp1 as the position plus 1 because it start at -1
        const posp1 = [0, 0, 0] as vec3;
        // multiply it by l to have the size be applied
        vec3.multiply(posp1, posp1, [l, l, l]);
        // and add the position to the mid point to offset it
        vec3.add(midPoint, midPoint, posp1);
        return midPoint;
    }));
    const { points, tris } = unpackTriVecArray(resTris);
    const t: [number, number][] = []
    /// @ts-expect-error
    resTris.forEach(v => t.push(...[
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1]
    ]));
    new Primitive(points, tris, null, world, shaders.vert, shaders.frag, t, createTextureFromColor(gl, [255, 0, 0, 255]), .5);
    new Cube(world, shaders.vert, shaders.frag, createTextureFromColor(gl, [255, 0, 0, 16
    ]), .5);
}

function draw() {
    world.updateValues();
    world.render();
    requestAnimationFrame(draw);
}


function play() {
    const fac = .1;
    let vec: vec3 = vec3.create();
    const add = (x: number, y: number, z: number) => vec3.add(vec, vec, vec3.set(vec3.create(), x, y, z));
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
        add(0, fac, 0);
    }
    // tab
    if (KeysDown.has(9)) {
        add(0, -fac, 0)
    }
    vec3.add(world.cameraTranslation, world.cameraTranslation, vec3.transformMat4(vec3.create(), vec, mat4.invert(mat4.create(), world.viewRotationMatrix)));
    vec3.set(world.pointLights[0].position, ...<[number, number, number]>world.cameraTranslation);
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
    if (false) {
        for (let i of mesh) {
            i.rotation[2] = mousePos.x / canvas.width * (Math.PI * 2) * sensibility;
            i.rotation[0] = mousePos.y / canvas.height * (Math.PI * 2) * -1 * sensibility;
        }
    } else {
        world.cameraRotation[1] = mousePos.x / canvas.width * (Math.PI * 2) * sensibility;
        world.cameraRotation[0] = mousePos.y / canvas.height * (Math.PI * 2) * -1 * sensibility;
    }
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


setInterval(play, 1000 / 60);
requestAnimationFrame(draw);

rh(canvas);
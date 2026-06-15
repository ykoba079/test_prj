const createScene = function () {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.55, 0.73, 0.92, 1);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0065;
    scene.fogColor = new BABYLON.Color3(0.64, 0.76, 0.84);

    const camera = new BABYLON.UniversalCamera("documentaryCamera", new BABYLON.Vector3(-80, 18, -92), scene);
    camera.setTarget(new BABYLON.Vector3(-18, 12, -22));
    camera.minZ = 0.2;
    camera.maxZ = 1200;
    camera.fov = 0.64;
    camera.attachControl(canvas, true);

    const seed = mulberry32(20260615);
    const root = new BABYLON.TransformNode("proceduralNatureDocumentaryRoot", scene);

    const hemi = new BABYLON.HemisphericLight("softSkyLight", new BABYLON.Vector3(-0.25, 1, 0.25), scene);
    hemi.intensity = 0.72;
    hemi.diffuse = new BABYLON.Color3(0.88, 0.95, 1);
    hemi.groundColor = new BABYLON.Color3(0.18, 0.25, 0.18);

    const sun = new BABYLON.DirectionalLight("lateAfternoonSun", new BABYLON.Vector3(-0.64, -0.42, 0.28), scene);
    sun.position = new BABYLON.Vector3(160, 105, -125);
    sun.intensity = 3.15;
    sun.diffuse = new BABYLON.Color3(1, 0.82, 0.56);
    sun.specular = new BABYLON.Color3(1, 0.9, 0.72);

    const shadow = new BABYLON.ShadowGenerator(2048, sun);
    shadow.useBlurExponentialShadowMap = true;
    shadow.blurKernel = 34;
    shadow.depthScale = 60;

    const sky = createLayeredSky(scene, root, sun.position);
    const materials = createMaterials(scene);
    const terrain = createTerrain(scene, root, materials, shadow);
    const ocean = createOcean(scene, root, materials);
    const river = createRiver(scene, root, materials);
    const forest = createForest(scene, root, materials, terrain.heightAt, shadow, seed);
    const reeds = createReeds(scene, root, materials, terrain.heightAt, seed);
    const birds = createBirds(scene, root, materials);
    const clouds = createClouds(scene, root, materials, seed);
    const mist = createMistBands(scene, root, materials, seed);
    const highlights = createSunGlints(scene, root, materials);

    createForegroundRocks(scene, root, materials, terrain.heightAt, shadow, seed);
    createDistantMountains(scene, root, materials, shadow);
    createUnderstory(scene, root, materials, terrain.heightAt, seed);
    createCinematicGrade(scene, camera);

    const shots = createCameraShots();
    let activeShot = 0;
    let shotStartedAt = 0;

    scene.onBeforeRenderObservable.add(function () {
        const time = performance.now() * 0.001;
        const dt = Math.min(engine.getDeltaTime() * 0.001, 0.05);

        if (time - shotStartedAt > shots[activeShot].duration) {
            activeShot = (activeShot + 1) % shots.length;
            shotStartedAt = time;
        }

        const shot = shots[activeShot];
        const t = smooth01((time - shotStartedAt) / shot.duration);
        const cameraGoal = samplePath(shot.camera, t);
        const targetGoal = samplePath(shot.target, t);
        const breathing = new BABYLON.Vector3(
            Math.sin(time * 0.17) * shot.drift,
            Math.sin(time * 0.23 + 1.7) * shot.drift * 0.28,
            Math.cos(time * 0.13) * shot.drift
        );

        camera.position = BABYLON.Vector3.Lerp(camera.position, cameraGoal.add(breathing), 0.045);
        camera.setTarget(BABYLON.Vector3.Lerp(camera.getTarget(), targetGoal, 0.055));
        camera.fov = BABYLON.Scalar.Lerp(camera.fov, shot.fov, 0.018);

        const dayPulse = Math.sin(time * 0.045);
        sun.intensity = 2.85 + dayPulse * 0.35;
        sun.direction = new BABYLON.Vector3(-0.66 + dayPulse * 0.08, -0.43, 0.28).normalize();
        scene.fogDensity = 0.0058 + activeShot * 0.00065 + Math.sin(time * 0.11) * 0.0007;

        animateOcean(ocean, time);
        animateRiver(river, time);
        animateForest(forest, time);
        animateReeds(reeds, time);
        animateBirds(birds, time);
        animateClouds(clouds, time, dt);
        animateMist(mist, time, dt);
        animateSunGlints(highlights, time);
        animateSky(sky, time, sun.position);
    });

    return scene;
};

function createMaterials(scene) {
    const textureRoot = "https://assets.babylonjs.com/environments/";

    const groundTex = new BABYLON.Texture(textureRoot + "grass.jpg", scene);
    groundTex.uScale = 30;
    groundTex.vScale = 30;

    const rockTex = new BABYLON.Texture(textureRoot + "rock.png", scene);
    rockTex.uScale = 9;
    rockTex.vScale = 9;

    const waterBump = new BABYLON.Texture(textureRoot + "waterbump.png", scene);
    waterBump.uScale = 12;
    waterBump.vScale = 12;

    const terrain = new BABYLON.StandardMaterial("terrain: grass, moss, exposed earth", scene);
    terrain.diffuseTexture = groundTex;
    terrain.diffuseColor = new BABYLON.Color3(0.34, 0.48, 0.23);
    terrain.specularColor = new BABYLON.Color3(0.015, 0.02, 0.012);

    const slope = new BABYLON.StandardMaterial("slope: wet rock", scene);
    slope.diffuseTexture = rockTex;
    slope.diffuseColor = new BABYLON.Color3(0.45, 0.44, 0.38);
    slope.specularColor = new BABYLON.Color3(0.08, 0.075, 0.065);

    const ocean = new BABYLON.StandardMaterial("ocean: layered transparent blue", scene);
    ocean.diffuseColor = new BABYLON.Color3(0.03, 0.28, 0.38);
    ocean.emissiveColor = new BABYLON.Color3(0.0, 0.055, 0.08);
    ocean.specularColor = new BABYLON.Color3(0.9, 0.97, 1);
    ocean.specularPower = 96;
    ocean.alpha = 0.86;
    ocean.bumpTexture = waterBump;

    const river = ocean.clone("river: shallow green water");
    river.diffuseColor = new BABYLON.Color3(0.05, 0.32, 0.28);
    river.emissiveColor = new BABYLON.Color3(0.0, 0.045, 0.035);
    river.alpha = 0.78;
    river.bumpTexture = waterBump.clone();
    river.bumpTexture.uScale = 7;
    river.bumpTexture.vScale = 18;

    const foam = new BABYLON.StandardMaterial("foam: shoreline streaks", scene);
    foam.diffuseColor = new BABYLON.Color3(0.92, 0.98, 0.94);
    foam.emissiveColor = new BABYLON.Color3(0.18, 0.23, 0.2);
    foam.specularColor = new BABYLON.Color3(0.8, 0.9, 0.88);
    foam.alpha = 0.48;
    foam.backFaceCulling = false;

    const bark = new BABYLON.StandardMaterial("bark: cedar trunks", scene);
    bark.diffuseColor = new BABYLON.Color3(0.18, 0.115, 0.07);
    bark.specularColor = BABYLON.Color3.Black();

    const cedar = new BABYLON.StandardMaterial("needles: deep cedar", scene);
    cedar.diffuseColor = new BABYLON.Color3(0.06, 0.25, 0.13);
    cedar.specularColor = new BABYLON.Color3(0.01, 0.02, 0.01);

    const leaf = new BABYLON.StandardMaterial("leaves: broadleaf canopy", scene);
    leaf.diffuseColor = new BABYLON.Color3(0.27, 0.45, 0.18);
    leaf.specularColor = new BABYLON.Color3(0.025, 0.035, 0.015);

    const silverLeaf = leaf.clone("leaves: sunlit silver green");
    silverLeaf.diffuseColor = new BABYLON.Color3(0.48, 0.58, 0.36);

    const reed = new BABYLON.StandardMaterial("reeds: dry gold", scene);
    reed.diffuseColor = new BABYLON.Color3(0.68, 0.56, 0.28);
    reed.specularColor = new BABYLON.Color3(0.04, 0.035, 0.02);

    const bird = new BABYLON.StandardMaterial("birds: distant silhouettes", scene);
    bird.diffuseColor = new BABYLON.Color3(0.035, 0.04, 0.035);
    bird.emissiveColor = new BABYLON.Color3(0.005, 0.006, 0.005);
    bird.specularColor = BABYLON.Color3.Black();

    const cloud = new BABYLON.StandardMaterial("clouds: layered mist", scene);
    cloud.diffuseColor = new BABYLON.Color3(0.95, 0.93, 0.86);
    cloud.emissiveColor = new BABYLON.Color3(0.18, 0.18, 0.16);
    cloud.alpha = 0.32;
    cloud.backFaceCulling = false;

    const glint = new BABYLON.StandardMaterial("glints: sun on water", scene);
    glint.diffuseColor = new BABYLON.Color3(1.0, 0.93, 0.74);
    glint.emissiveColor = new BABYLON.Color3(0.9, 0.7, 0.34);
    glint.alpha = 0.46;
    glint.backFaceCulling = false;

    return {
        terrain,
        slope,
        ocean,
        river,
        foam,
        bark,
        cedar,
        leaf,
        silverLeaf,
        reed,
        bird,
        cloud,
        glint
    };
}

function createTerrain(scene, root, materials, shadow) {
    const size = 210;
    const half = size / 2;
    const subdivisions = 170;
    const vertices = [];
    const indices = [];
    const colors = [];

    function heightAt(x, z) {
        const coast = BABYLON.Scalar.Clamp((z + 78) / 55, 0, 1);
        const inland = BABYLON.Scalar.Clamp((z + 30) / 115, 0, 1);
        const ridgeOne = 31 * Math.exp(-Math.pow((x + 44) / 36, 2)) * Math.pow(inland, 1.3);
        const ridgeTwo = 22 * Math.exp(-Math.pow((x - 28) / 42, 2)) * Math.pow(inland, 1.15);
        const rolling = (
            Math.sin(x * 0.055) * 3.3 +
            Math.cos(z * 0.047) * 3.0 +
            Math.sin((x + z) * 0.035) * 2.4 +
            Math.cos((x - z) * 0.027) * 1.8
        ) * (0.45 + inland * 0.9);
        const valley = -9.2 * Math.exp(-Math.pow((x + Math.sin(z * 0.045) * 16) / 16, 2)) * BABYLON.Scalar.Clamp((z + 70) / 115, 0, 1);
        const shoreline = -7.5 * (1 - coast);
        return shoreline + ridgeOne + ridgeTwo + rolling + valley;
    }

    for (let z = 0; z <= subdivisions; z++) {
        for (let x = 0; x <= subdivisions; x++) {
            const px = (x / subdivisions) * size - half;
            const pz = (z / subdivisions) * size - half;
            const py = heightAt(px, pz);
            vertices.push(px, py, pz);

            const high = BABYLON.Scalar.Clamp((py + 5) / 45, 0, 1);
            const wet = BABYLON.Scalar.Clamp((-pz - 52) / 50, 0, 1);
            colors.push(
                0.22 + high * 0.22 - wet * 0.08,
                0.36 + high * 0.18 - wet * 0.1,
                0.17 + high * 0.08,
                1
            );
        }
    }

    for (let z = 0; z < subdivisions; z++) {
        for (let x = 0; x < subdivisions; x++) {
            const a = z * (subdivisions + 1) + x;
            const b = a + 1;
            const c = a + subdivisions + 1;
            const d = c + 1;
            indices.push(a, d, b, a, c, d);
        }
    }

    const terrain = new BABYLON.Mesh("single procedural terrain mesh", scene);
    const data = new BABYLON.VertexData();
    data.positions = vertices;
    data.indices = indices;
    data.colors = colors;
    data.applyToMesh(terrain, true);
    terrain.convertToFlatShadedMesh();
    terrain.material = materials.terrain;
    terrain.receiveShadows = true;
    terrain.parent = root;

    const ridgeCaps = [];
    for (let i = 0; i < 28; i++) {
        const x = -82 + i * 6.2;
        const z = 24 + Math.sin(i * 0.9) * 11 + (i % 4) * 2;
        const rock = BABYLON.MeshBuilder.CreatePolyhedron("exposed ridge rock", {
            type: 2,
            size: 5.4 + (i % 5) * 1.2
        }, scene);
        rock.position = new BABYLON.Vector3(x, heightAt(x, z) + 2.2, z);
        rock.scaling = new BABYLON.Vector3(1.8, 0.85 + (i % 3) * 0.24, 1.2);
        rock.rotation = new BABYLON.Vector3(i * 0.17, i * 0.43, i * 0.11);
        rock.material = materials.slope;
        rock.parent = root;
        shadow.addShadowCaster(rock);
        ridgeCaps.push(rock);
    }

    return { mesh: terrain, heightAt, ridgeCaps };
}

function createDistantMountains(scene, root, materials, shadow) {
    const mountains = [];
    for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < 15; i++) {
            const mountain = BABYLON.MeshBuilder.CreatePolyhedron("distant mountain peak", {
                type: 1,
                size: 18 + layer * 8 + (i % 5) * 3
            }, scene);
            mountain.position = new BABYLON.Vector3(-130 + i * 19 + layer * 8, 30 + layer * 8 + Math.sin(i) * 3, 84 + layer * 34);
            mountain.scaling = new BABYLON.Vector3(1.45, 2.2 + Math.sin(i * 1.3) * 0.34, 1.2);
            mountain.rotation = new BABYLON.Vector3(0.08, i * 0.44, 0.02);
            mountain.material = layer === 0 ? materials.slope : materials.slope.clone("distant blue mountain material " + layer + "-" + i);
            mountain.material.diffuseColor = new BABYLON.Color3(0.34 - layer * 0.035, 0.41 - layer * 0.025, 0.39 + layer * 0.02);
            mountain.parent = root;
            shadow.addShadowCaster(mountain);
            mountains.push(mountain);
        }
    }
    return mountains;
}

function createOcean(scene, root, materials) {
    const ocean = BABYLON.MeshBuilder.CreateGround("broad procedural ocean", {
        width: 360,
        height: 150,
        subdivisions: 150,
        updatable: true
    }, scene);
    ocean.position = new BABYLON.Vector3(0, -4.2, -128);
    ocean.material = materials.ocean;
    ocean.parent = root;

    const positions = ocean.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const base = positions.slice();

    const foam = [];
    for (let i = 0; i < 45; i++) {
        const strip = BABYLON.MeshBuilder.CreatePlane("ocean surf lace", {
            width: 7.0 + (i % 6) * 1.7,
            height: 0.12
        }, scene);
        strip.position = new BABYLON.Vector3(-122 + i * 5.7, -3.92, -58 + Math.sin(i * 0.42) * 4.8);
        strip.rotation.x = Math.PI * 0.5;
        strip.rotation.z = Math.sin(i * 0.73) * 0.24;
        strip.material = materials.foam;
        strip.parent = root;
        foam.push(strip);
    }

    return { mesh: ocean, positions, base, foam, material: materials.ocean };
}

function createRiver(scene, root, materials) {
    const paths = [];
    const left = [];
    const center = [];
    const right = [];
    for (let i = 0; i < 120; i++) {
        const z = -70 + i * 1.35;
        const cx = -Math.sin(z * 0.045) * 16;
        const width = 4.2 + Math.sin(i * 0.28) * 1.1;
        left.push(new BABYLON.Vector3(cx - width, -2.9, z));
        center.push(new BABYLON.Vector3(cx, -2.82, z));
        right.push(new BABYLON.Vector3(cx + width, -2.9, z));
    }
    paths.push(left, center, right);

    const river = BABYLON.MeshBuilder.CreateRibbon("winding river surface", {
        pathArray: paths,
        sideOrientation: BABYLON.Mesh.DOUBLESIDE,
        updatable: true
    }, scene);
    river.material = materials.river;
    river.parent = root;

    const positions = river.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const base = positions.slice();
    const streaks = [];
    for (let i = 0; i < 38; i++) {
        const z = -66 + i * 3.2;
        const cx = -Math.sin(z * 0.045) * 16;
        const streak = BABYLON.MeshBuilder.CreatePlane("river silver current", {
            width: 0.16,
            height: 3.0 + (i % 4) * 0.8
        }, scene);
        streak.position = new BABYLON.Vector3(cx + Math.sin(i * 1.9) * 2.1, -2.65, z);
        streak.rotation.x = Math.PI * 0.5;
        streak.rotation.z = Math.sin(i) * 0.34;
        streak.material = materials.glint;
        streak.parent = root;
        streaks.push(streak);
    }

    return { mesh: river, positions, base, streaks };
}

function createForest(scene, root, materials, heightAt, shadow, rand) {
    const trunkBase = BABYLON.MeshBuilder.CreateCylinder("tree trunk source", {
        diameterTop: 0.42,
        diameterBottom: 0.72,
        height: 5.8,
        tessellation: 7
    }, scene);
    trunkBase.material = materials.bark;
    trunkBase.isVisible = false;

    const cedarBase = BABYLON.MeshBuilder.CreateCylinder("cedar canopy source", {
        diameterTop: 0.05,
        diameterBottom: 5.3,
        height: 9.2,
        tessellation: 9
    }, scene);
    cedarBase.material = materials.cedar;
    cedarBase.isVisible = false;

    const broadBase = BABYLON.MeshBuilder.CreatePolyhedron("broadleaf canopy source", {
        type: 2,
        size: 4.3
    }, scene);
    broadBase.material = materials.leaf;
    broadBase.isVisible = false;

    const trees = [];
    for (let i = 0; i < 360; i++) {
        const angle = i * 2.39996323;
        const radius = 13 + Math.sqrt(i) * 6.15 + rand() * 18;
        let x = Math.cos(angle) * radius + (rand() - 0.5) * 12;
        let z = Math.sin(angle) * radius * 0.72 + 8 + (rand() - 0.5) * 16;
        if (z < -54 || z > 86 || Math.abs(x + Math.sin(z * 0.045) * 16) < 8.8) {
            continue;
        }

        const y = heightAt(x, z);
        const scale = 0.62 + rand() * 1.05 + BABYLON.Scalar.Clamp((z + 10) / 110, 0, 1) * 0.35;
        const trunk = trunkBase.createInstance("tree trunk");
        trunk.position = new BABYLON.Vector3(x, y + 2.65 * scale, z);
        trunk.scaling = new BABYLON.Vector3(scale * 0.65, scale, scale * 0.65);
        trunk.rotation = new BABYLON.Vector3((rand() - 0.5) * 0.07, rand() * Math.PI, (rand() - 0.5) * 0.08);
        trunk.parent = root;

        const cedarLike = rand() > 0.38;
        const canopy = (cedarLike ? cedarBase : broadBase).createInstance(cedarLike ? "cedar canopy" : "broadleaf canopy");
        canopy.position = new BABYLON.Vector3(x, y + (cedarLike ? 7.6 : 6.4) * scale, z);
        canopy.scaling = new BABYLON.Vector3(scale * (cedarLike ? 0.85 : 1.18), scale * (cedarLike ? 1.05 : 0.85), scale * (cedarLike ? 0.85 : 1.02));
        canopy.rotation = new BABYLON.Vector3((rand() - 0.5) * 0.12, rand() * Math.PI, (rand() - 0.5) * 0.16);
        canopy.parent = root;

        shadow.addShadowCaster(trunk);
        shadow.addShadowCaster(canopy);
        trees.push({ trunk, canopy, baseRot: canopy.rotation.clone(), sway: 0.35 + rand() * 0.65, phase: rand() * Math.PI * 2 });
    }

    return { trees, trunkBase, cedarBase, broadBase };
}

function createUnderstory(scene, root, materials, heightAt, rand) {
    const grassMat = materials.leaf.clone("understory grass variation");
    grassMat.diffuseColor = new BABYLON.Color3(0.24, 0.42, 0.16);

    const blade = BABYLON.MeshBuilder.CreateCylinder("grass blade source", {
        diameterTop: 0.015,
        diameterBottom: 0.05,
        height: 1.25,
        tessellation: 4
    }, scene);
    blade.material = grassMat;
    blade.isVisible = false;

    for (let i = 0; i < 620; i++) {
        const z = -42 + rand() * 118;
        const x = -95 + rand() * 190;
        if (Math.abs(x + Math.sin(z * 0.045) * 16) < 7.5) {
            continue;
        }
        const y = heightAt(x, z);
        const g = blade.createInstance("understory blade");
        const scale = 0.55 + rand() * 1.1;
        g.position = new BABYLON.Vector3(x, y + 0.45 * scale, z);
        g.scaling = new BABYLON.Vector3(scale, scale, scale);
        g.rotation = new BABYLON.Vector3((rand() - 0.5) * 0.34, rand() * Math.PI, (rand() - 0.5) * 0.4);
        g.parent = root;
    }
}

function createReeds(scene, root, materials, heightAt, rand) {
    const reeds = [];
    for (let i = 0; i < 260; i++) {
        const z = -64 + i * 0.54;
        const side = i % 2 === 0 ? -1 : 1;
        const riverX = -Math.sin(z * 0.045) * 16;
        const x = riverX + side * (6 + rand() * 5);
        const y = heightAt(x, z);
        const reed = BABYLON.MeshBuilder.CreateCylinder("river reed", {
            diameterTop: 0.028,
            diameterBottom: 0.07,
            height: 2.1 + rand() * 1.7,
            tessellation: 5
        }, scene);
        reed.position = new BABYLON.Vector3(x, y + 0.85, z + (rand() - 0.5) * 1.0);
        reed.rotation = new BABYLON.Vector3((rand() - 0.5) * 0.28, rand() * Math.PI, (rand() - 0.5) * 0.32);
        reed.material = materials.reed;
        reed.parent = root;
        reeds.push({ mesh: reed, baseRot: reed.rotation.clone(), phase: rand() * Math.PI * 2 });
    }
    return reeds;
}

function createForegroundRocks(scene, root, materials, heightAt, shadow, rand) {
    for (let i = 0; i < 60; i++) {
        const z = -62 + rand() * 118;
        const riverX = -Math.sin(z * 0.045) * 16;
        const x = riverX + (rand() > 0.5 ? 1 : -1) * (7 + rand() * 8);
        const rock = BABYLON.MeshBuilder.CreatePolyhedron("rounded river rock", {
            type: 2,
            size: 1.0 + rand() * 2.8
        }, scene);
        rock.position = new BABYLON.Vector3(x, heightAt(x, z) + 0.35, z);
        rock.scaling = new BABYLON.Vector3(1.5 + rand() * 1.4, 0.42 + rand() * 0.45, 1.1 + rand());
        rock.rotation = new BABYLON.Vector3(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
        rock.material = materials.slope;
        rock.parent = root;
        shadow.addShadowCaster(rock);
    }
}

function createBirds(scene, root, materials) {
    const birds = [];
    for (let i = 0; i < 18; i++) {
        const birdRoot = new BABYLON.TransformNode("circling bird", scene);
        birdRoot.parent = root;

        const body = BABYLON.MeshBuilder.CreateSphere("bird body", { diameter: 0.42, segments: 8 }, scene);
        body.scaling.x = 1.45;
        body.material = materials.bird;
        body.parent = birdRoot;

        const left = BABYLON.MeshBuilder.CreatePlane("left wing", { width: 1.05, height: 0.24 }, scene);
        left.position.x = -0.46;
        left.rotation.y = Math.PI * 0.5;
        left.material = materials.bird;
        left.parent = birdRoot;

        const right = BABYLON.MeshBuilder.CreatePlane("right wing", { width: 1.05, height: 0.24 }, scene);
        right.position.x = 0.46;
        right.rotation.y = Math.PI * 0.5;
        right.material = materials.bird;
        right.parent = birdRoot;

        birdRoot.scaling.scaleInPlace(0.8 + i * 0.035);
        birds.push({ root: birdRoot, left, right, phase: i * 0.71, radius: 34 + i * 2.4, speed: 0.13 + i * 0.004 });
    }
    return birds;
}

function createClouds(scene, root, materials, rand) {
    const clouds = [];
    for (let i = 0; i < 30; i++) {
        const cloud = new BABYLON.TransformNode("layered cloud", scene);
        cloud.parent = root;
        cloud.position = new BABYLON.Vector3(-150 + rand() * 300, 58 + rand() * 42, -78 + rand() * 175);
        cloud.scaling = new BABYLON.Vector3(1.4 + rand() * 2.6, 0.45 + rand() * 0.5, 1.0 + rand() * 1.6);

        for (let j = 0; j < 5; j++) {
            const puff = BABYLON.MeshBuilder.CreateSphere("soft cloud puff", {
                diameter: 12 + rand() * 10,
                segments: 12
            }, scene);
            puff.position = new BABYLON.Vector3((j - 2) * (6 + rand() * 3), rand() * 3, (rand() - 0.5) * 9);
            puff.scaling.y = 0.26 + rand() * 0.16;
            puff.material = materials.cloud;
            puff.parent = cloud;
        }
        clouds.push({ root: cloud, speed: 0.9 + rand() * 1.4 });
    }
    return clouds;
}

function createMistBands(scene, root, materials, rand) {
    const bands = [];
    const mistMat = materials.cloud.clone("valley mist translucent bands");
    mistMat.alpha = 0.18;
    mistMat.diffuseColor = new BABYLON.Color3(0.9, 0.94, 0.9);

    for (let i = 0; i < 28; i++) {
        const band = BABYLON.MeshBuilder.CreatePlane("valley mist band", {
            width: 42 + rand() * 50,
            height: 4.5 + rand() * 5
        }, scene);
        band.position = new BABYLON.Vector3(-86 + rand() * 172, 5 + rand() * 24, -12 + rand() * 82);
        band.rotation.y = (rand() - 0.5) * 0.25;
        band.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
        band.material = mistMat;
        band.parent = root;
        bands.push({ mesh: band, speed: 0.55 + rand() * 0.6, phase: rand() * Math.PI * 2 });
    }
    return bands;
}

function createSunGlints(scene, root, materials) {
    const glints = [];
    for (let i = 0; i < 42; i++) {
        const glint = BABYLON.MeshBuilder.CreatePlane("small sun glint", {
            width: 1.0 + (i % 5) * 0.65,
            height: 0.045
        }, scene);
        glint.position = new BABYLON.Vector3(-72 + i * 3.7, -3.74, -116 + Math.sin(i * 0.82) * 14);
        glint.rotation.x = Math.PI * 0.5;
        glint.rotation.z = Math.sin(i) * 0.4;
        glint.material = materials.glint;
        glint.parent = root;
        glints.push(glint);
    }
    return glints;
}

function createLayeredSky(scene, root, sunPosition) {
    const dome = BABYLON.MeshBuilder.CreateSphere("gradient sky dome", {
        diameter: 920,
        segments: 48,
        sideOrientation: BABYLON.Mesh.BACKSIDE
    }, scene);
    dome.position.y = -22;
    dome.parent = root;
    dome.isPickable = false;
    dome.applyFog = false;

    const shaderName = "documentaryGradientSky";
    BABYLON.Effect.ShadersStore[shaderName + "VertexShader"] = [
        "precision highp float;",
        "attribute vec3 position;",
        "uniform mat4 worldViewProjection;",
        "varying vec3 vPos;",
        "void main(void){",
        "vPos = normalize(position);",
        "gl_Position = worldViewProjection * vec4(position, 1.0);",
        "}"
    ].join("\n");

    BABYLON.Effect.ShadersStore[shaderName + "FragmentShader"] = [
        "precision highp float;",
        "varying vec3 vPos;",
        "uniform vec3 sunDir;",
        "uniform float time;",
        "void main(void){",
        "float h = clamp(vPos.y * 0.5 + 0.5, 0.0, 1.0);",
        "vec3 horizon = vec3(0.95, 0.70, 0.44);",
        "vec3 zenith = vec3(0.23, 0.52, 0.86);",
        "vec3 dusk = vec3(0.54, 0.35, 0.58);",
        "vec3 sky = mix(horizon, zenith, pow(h, 1.25));",
        "float sun = pow(max(dot(normalize(vPos), normalize(sunDir)), 0.0), 260.0);",
        "float warm = pow(max(dot(normalize(vPos), normalize(sunDir)), 0.0), 4.5);",
        "sky = mix(sky, dusk, (1.0 - h) * 0.16);",
        "sky += vec3(1.0, 0.72, 0.36) * warm * 0.38;",
        "sky += vec3(1.0, 0.88, 0.55) * sun * 2.1;",
        "gl_FragColor = vec4(sky, 1.0);",
        "}"
    ].join("\n");

    const mat = new BABYLON.ShaderMaterial("gradient sky material", scene, shaderName, {
        attributes: ["position"],
        uniforms: ["worldViewProjection", "sunDir", "time"]
    });
    mat.backFaceCulling = false;
    mat.disableDepthWrite = true;
    mat.setVector3("sunDir", sunPosition.normalize());
    mat.setFloat("time", 0);
    dome.material = mat;

    return { dome, mat };
}

function createCinematicGrade(scene, camera) {
    const pipeline = new BABYLON.DefaultRenderingPipeline("documentary color grade", true, scene, [camera]);
    pipeline.fxaaEnabled = true;
    pipeline.samples = 4;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.82;
    pipeline.bloomWeight = 0.18;
    pipeline.bloomKernel = 52;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.exposure = 1.03;
    pipeline.imageProcessing.contrast = 1.22;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 1.65;
    pipeline.imageProcessing.vignetteStretch = 0.34;
    pipeline.imageProcessing.vignetteColor = new BABYLON.Color4(0, 0, 0, 1);
    return pipeline;
}

function createCameraShots() {
    return [
        {
            duration: 13.0,
            fov: 0.68,
            drift: 0.8,
            camera: path([
                new BABYLON.Vector3(-118, 16, -106),
                new BABYLON.Vector3(-92, 17, -86),
                new BABYLON.Vector3(-60, 20, -62),
                new BABYLON.Vector3(-29, 24, -34)
            ]),
            target: path([
                new BABYLON.Vector3(-42, 12, -36),
                new BABYLON.Vector3(-20, 14, -18),
                new BABYLON.Vector3(6, 16, 8),
                new BABYLON.Vector3(18, 18, 36)
            ])
        },
        {
            duration: 14.5,
            fov: 0.53,
            drift: 0.45,
            camera: path([
                new BABYLON.Vector3(78, 8.5, -93),
                new BABYLON.Vector3(42, 7.5, -76),
                new BABYLON.Vector3(10, 8.3, -56),
                new BABYLON.Vector3(-22, 10.5, -38)
            ]),
            target: path([
                new BABYLON.Vector3(18, -2, -80),
                new BABYLON.Vector3(-8, -1, -66),
                new BABYLON.Vector3(-30, 4, -48),
                new BABYLON.Vector3(-42, 10, -24)
            ])
        },
        {
            duration: 13.8,
            fov: 0.61,
            drift: 0.65,
            camera: path([
                new BABYLON.Vector3(-46, 10, -20),
                new BABYLON.Vector3(-32, 21, 2),
                new BABYLON.Vector3(-18, 35, 24),
                new BABYLON.Vector3(4, 47, 44)
            ]),
            target: path([
                new BABYLON.Vector3(-8, 5, 2),
                new BABYLON.Vector3(0, 13, 28),
                new BABYLON.Vector3(16, 25, 54),
                new BABYLON.Vector3(38, 31, 88)
            ])
        },
        {
            duration: 15.2,
            fov: 0.78,
            drift: 1.2,
            camera: path([
                new BABYLON.Vector3(108, 36, -18),
                new BABYLON.Vector3(84, 42, 18),
                new BABYLON.Vector3(48, 52, 54),
                new BABYLON.Vector3(-8, 66, 78)
            ]),
            target: path([
                new BABYLON.Vector3(18, 16, 8),
                new BABYLON.Vector3(-6, 22, 28),
                new BABYLON.Vector3(-24, 28, 54),
                new BABYLON.Vector3(-38, 32, 82)
            ])
        }
    ];
}

function animateOcean(ocean, time) {
    const positions = ocean.mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    for (let i = 0; i < positions.length; i += 3) {
        const x = ocean.base[i];
        const z = ocean.base[i + 2];
        positions[i + 1] =
            ocean.base[i + 1] +
            Math.sin(time * 0.95 + x * 0.08) * 0.32 +
            Math.sin(time * 1.8 + z * 0.16 + x * 0.03) * 0.16;
    }
    ocean.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);

    ocean.foam.forEach(function (strip, i) {
        strip.position.z += 0.018 + (i % 5) * 0.004;
        strip.position.y = -3.88 + Math.sin(time * 1.3 + i) * 0.055;
        strip.visibility = 0.25 + Math.pow(Math.sin(time * 0.9 + i * 0.7) * 0.5 + 0.5, 2) * 0.55;
        if (strip.position.z > -45) {
            strip.position.z = -65 - (i % 8);
        }
    });
}

function animateRiver(river, time) {
    const positions = river.mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    for (let i = 0; i < positions.length; i += 3) {
        const x = river.base[i];
        const z = river.base[i + 2];
        positions[i + 1] = river.base[i + 1] + Math.sin(time * 1.9 + z * 0.32) * 0.07 + Math.cos(time * 2.4 + x) * 0.025;
    }
    river.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);

    river.streaks.forEach(function (streak, i) {
        streak.position.z += 0.052 + (i % 4) * 0.01;
        streak.visibility = 0.12 + Math.pow(Math.sin(time * 1.5 + i) * 0.5 + 0.5, 2) * 0.48;
        if (streak.position.z > 90) {
            streak.position.z = -68;
        }
        streak.position.x = -Math.sin(streak.position.z * 0.045) * 16 + Math.sin(i * 1.9) * 2.1;
    });
}

function animateForest(forest, time) {
    forest.trees.forEach(function (tree) {
        tree.canopy.rotation.x = tree.baseRot.x + Math.sin(time * 0.72 + tree.phase) * 0.018 * tree.sway;
        tree.canopy.rotation.z = tree.baseRot.z + Math.cos(time * 0.63 + tree.phase) * 0.024 * tree.sway;
    });
}

function animateReeds(reeds, time) {
    reeds.forEach(function (reed) {
        reed.mesh.rotation.x = reed.baseRot.x + Math.sin(time * 1.4 + reed.phase) * 0.12;
        reed.mesh.rotation.z = reed.baseRot.z + Math.cos(time * 1.2 + reed.phase) * 0.18;
    });
}

function animateBirds(birds, time) {
    birds.forEach(function (bird, i) {
        const phase = time * bird.speed + bird.phase;
        bird.root.position.x = Math.cos(phase) * bird.radius;
        bird.root.position.z = 10 + Math.sin(phase * 0.9) * bird.radius * 0.64;
        bird.root.position.y = 38 + Math.sin(phase * 1.7) * 9 + i * 0.42;
        bird.root.rotation.y = -phase + Math.PI * 0.5;
        bird.left.rotation.z = Math.sin(time * 7.0 + i) * 0.5;
        bird.right.rotation.z = -Math.sin(time * 7.0 + i) * 0.5;
    });
}

function animateClouds(clouds, time, dt) {
    clouds.forEach(function (cloud, i) {
        cloud.root.position.x += cloud.speed * dt;
        cloud.root.position.y += Math.sin(time * 0.12 + i) * dt * 0.22;
        if (cloud.root.position.x > 170) {
            cloud.root.position.x = -170;
        }
    });
}

function animateMist(bands, time, dt) {
    bands.forEach(function (band) {
        band.mesh.position.x += band.speed * dt;
        band.mesh.position.y += Math.sin(time * 0.34 + band.phase) * dt * 0.22;
        band.mesh.visibility = 0.35 + Math.sin(time * 0.21 + band.phase) * 0.16;
        if (band.mesh.position.x > 116) {
            band.mesh.position.x = -116;
        }
    });
}

function animateSunGlints(glints, time) {
    glints.forEach(function (glint, i) {
        glint.visibility = 0.12 + Math.pow(Math.sin(time * 1.1 + i * 0.51) * 0.5 + 0.5, 4) * 0.75;
        glint.scaling.x = 0.75 + Math.sin(time * 0.8 + i) * 0.2;
    });
}

function animateSky(sky, time, sunPosition) {
    sky.mat.setVector3("sunDir", sunPosition.normalize());
    sky.mat.setFloat("time", time);
    sky.dome.rotation.y = time * 0.002;
}

function path(points) {
    return BABYLON.Curve3.CreateCatmullRomSpline(points, 50, false).getPoints();
}

function samplePath(points, t) {
    const p = BABYLON.Scalar.Clamp(t, 0, 0.999999) * (points.length - 1);
    const index = Math.floor(p);
    const local = p - index;
    return BABYLON.Vector3.Lerp(points[index], points[Math.min(points.length - 1, index + 1)], local);
}

function smooth01(t) {
    t = BABYLON.Scalar.Clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
    return function () {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

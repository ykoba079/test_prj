(function (global) {
    "use strict";

    function createStage3FleetIntro(options = {}) {
        const canvas = options.canvas || document.getElementById("renderCanvas");
        const captionEl = options.captionEl || document.getElementById("caption");
        const captionTextEl = options.captionTextEl || document.getElementById("captionText");
        const replayButton = options.replayButton || document.getElementById("replayButton");
        const fleetButton = options.fleetButton || document.getElementById("fleetButton");
        const sideButton = options.sideButton || document.getElementById("sideButton");
        const isEmbedded = options.embedded ?? new URLSearchParams(window.location.search).get("embed") === "1";
        if (options.applyEmbeddedClass !== false && document.body) {
            document.body.classList.toggle("isEmbedded", isEmbedded);
        }

        const engine = new BABYLON.Engine(canvas, true, {
            preserveDrawingBuffer: true,
            stencil: true
        });

        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0.005, 0.008, 0.018, 1);
        scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        scene.fogColor = new BABYLON.Color3(0.02, 0.03, 0.055);
        scene.fogDensity = 0.018;

        const camera = new BABYLON.FreeCamera("introCamera", new BABYLON.Vector3(-14.2, 3.1, -11.0), scene);
        camera.fov = BABYLON.Tools.ToRadians(48);
        camera.minZ = 0.05;
        camera.maxZ = 320;
        camera.setTarget(new BABYLON.Vector3(-3.2, 0.5, 18));

        const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), scene);
        ambient.intensity = 0.42;

        const keyLight = new BABYLON.DirectionalLight("keyLight", new BABYLON.Vector3(-0.45, -0.35, 0.72), scene);
        keyLight.position.set(-8, 8, -14);
        keyLight.intensity = 1.55;

        const rimLight = new BABYLON.PointLight("rimLight", new BABYLON.Vector3(12, 4, -10), scene);
        rimLight.diffuse = new BABYLON.Color3(1, 0.48, 0.18);
        rimLight.intensity = 1.1;

        const orangeMat = new BABYLON.StandardMaterial("orangeGlowMat", scene);
        orangeMat.diffuseColor = new BABYLON.Color3(1, 0.42, 0.08);
        orangeMat.emissiveColor = new BABYLON.Color3(0.8, 0.2, 0.02);

        const smokeMat = new BABYLON.StandardMaterial("smokeMat", scene);
        smokeMat.diffuseColor = new BABYLON.Color3(0.52, 0.56, 0.58);
        smokeMat.alpha = 0.34;

        const fleetRoot = new BABYLON.TransformNode("fleetRoot", scene);
        const templates = {};
        const spawned = [];
        const fleetNodes = [];
        const fighterNodes = [];
        const introCaptions = [
            "見えたか？\nあれが、からあげ帝国主力艦隊だ。",
            "数で押しつぶす気だ。\n気を付けろ。"
        ];
        let introTime = 0;
        let cameraMode = "auto";
        let manualCaptionIndex = null;
        let disposed = false;

        function randomRange(min, max) {
            return min + Math.random() * (max - min);
        }

        function easeInOut(t) {
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        }

        function fitImportedModel(root, meshes, targetSize, rotation, scaleMultiplier = BABYLON.Vector3.One()) {
            const modelMeshes = meshes.filter((mesh) => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
            if (!modelMeshes.length) {
                return;
            }
            const bounds = BABYLON.Mesh.MinMax(modelMeshes);
            const size = bounds.max.subtract(bounds.min);
            const maxDimension = Math.max(size.x, size.y, size.z);
            const center = bounds.min.add(size.scale(0.5));
            modelMeshes.forEach((mesh) => {
                mesh.position.subtractInPlace(center);
            });
            root.rotation.set(rotation.x, rotation.y, rotation.z);
            const scale = maxDimension > 0 ? targetSize / maxDimension : 1;
            root.scaling.set(scale * scaleMultiplier.x, scale * scaleMultiplier.y, scale * scaleMultiplier.z);
        }

        async function loadTemplate(key, fileName, targetSize, rotation, scaleMultiplier = BABYLON.Vector3.One()) {
            const result = await BABYLON.SceneLoader.ImportMeshAsync("", "./", fileName, scene);
            const templateRoot = new BABYLON.TransformNode(`${key}Template`, scene);
            const modelRoot = new BABYLON.TransformNode(`${key}Model`, scene);
            modelRoot.parent = templateRoot;
            result.meshes.forEach((mesh) => {
                mesh.parent = modelRoot;
                mesh.setEnabled(false);
            });
            fitImportedModel(modelRoot, result.meshes, targetSize, rotation, scaleMultiplier);
            templateRoot.setEnabled(false);
            templates[key] = templateRoot;
        }

        function cloneTemplate(key, name, parent) {
            const template = templates[key];
            if (!template) {
                return null;
            }
            const clone = template.clone(name, parent || null, false);
            clone.setEnabled(true);
            clone.getChildMeshes(false).forEach((mesh) => mesh.setEnabled(true));
            spawned.push(clone);
            return clone;
        }

        function createStarfield() {
            const spaceBgLayer = new BABYLON.Layer("stage3SpaceBackground", "img/stage3-space-bg.jpg", scene, true);
            spaceBgLayer.isBackground = true;
            spaceBgLayer.scale = new BABYLON.Vector2(1, 1);

            const starMat = new BABYLON.StandardMaterial("starMat", scene);
            starMat.emissiveColor = new BABYLON.Color3(0.88, 0.94, 1);
            starMat.disableLighting = true;

            for (let i = 0; i < 720; i += 1) {
                const star = BABYLON.MeshBuilder.CreateSphere("star", {
                    diameter: randomRange(0.012, 0.052),
                    segments: 6
                }, scene);
                star.position.set(
                    randomRange(-65, 65),
                    randomRange(-30, 32),
                    randomRange(8, 115)
                );
                star.material = starMat;
                star.metadata = { twinkle: randomRange(0.4, 1.8), base: star.scaling.x };
            }

        }

        function addEngineGlow(parent, x, y, z, scale) {
            const glow = BABYLON.MeshBuilder.CreateSphere("engineGlow", {
                diameter: 0.34 * scale,
                segments: 12
            }, scene);
            glow.parent = parent;
            glow.position.set(x, y, z);
            glow.material = orangeMat;
            glow.metadata = { baseScale: scale };
            return glow;
        }

        function placeShip(kind, name, position, scale, parent, extraRotation = BABYLON.Vector3.Zero()) {
            const ship = cloneTemplate(kind, name, parent);
            if (!ship) {
                return null;
            }
            ship.position.copyFrom(position);
            ship.scaling.scaleInPlace(scale);
            ship.rotation.x += extraRotation.x;
            ship.rotation.y += extraRotation.y;
            ship.rotation.z += extraRotation.z;
            ship.metadata = {
                baseY: position.y,
                baseZ: position.z,
                drift: randomRange(0.4, 1.5),
                driftAmount: randomRange(0.02, 0.14),
                pathSpeed: 0,
                pathOffset: 0,
                pathRange: 64
            };
            if (parent === fleetRoot) {
                fleetNodes.push(ship);
            }
            return ship;
        }

        function buildFleet() {
            fleetNodes.splice(0).forEach((node) => node.dispose());
            fighterNodes.splice(0);

            const flagship = placeShip(
                "battleship",
                "imperialFlagship",
                new BABYLON.Vector3(-0.6, 0.1, 22),
                1.58,
                fleetRoot,
                new BABYLON.Vector3(0, BABYLON.Tools.ToRadians(-4), BABYLON.Tools.ToRadians(-2))
            );
            if (flagship) {
                addEngineGlow(flagship, -2.35, -0.15, -0.38, 0.46);
                addEngineGlow(flagship, -2.35, 0.28, 0.42, 0.34);
                addEngineGlow(flagship, -2.35, -0.55, 0.18, 0.3);
            }

            const corvettePositions = [
                [-5.9, 2.6, 16, 1.18],
                [4.8, 2.2, 18, 1.05],
                [6.2, -1.5, 15, 1.22],
                [-6.4, -2.4, 18, 0.95],
                [2.8, -3.8, 13, 1.36],
                [8.4, 0.2, 25, 0.78],
                [-9.2, 0.4, 24, 0.72],
                [1.4, 3.9, 27, 0.78],
                [-2.6, -4.4, 28, 0.72]
            ];
            corvettePositions.forEach((entry, index) => {
                const disk = placeShip(
                    "disk",
                    `imperialCorvette${index}`,
                    new BABYLON.Vector3(entry[0], entry[1], entry[2]),
                    entry[3] * 0.5,
                    fleetRoot,
                    new BABYLON.Vector3(0, BABYLON.Tools.ToRadians(randomRange(-8, 8)), BABYLON.Tools.ToRadians(randomRange(-8, 8)))
                );
                if (disk) {
                    addEngineGlow(disk, -0.7, -0.1, 0.05, 0.55 * entry[3]);
                }
            });

            const formationCenters = [
                [-13.4, 4.8, 11, 0.34], [-10.4, 5.8, 19, 0.31], [-15.2, 3.4, 28, 0.28],
                [10.9, 5.1, 13, 0.36], [14.2, 3.8, 22, 0.3], [8.8, 6.2, 34, 0.26],
                [-14.6, -4.6, 12, 0.36], [-9.7, -5.8, 21, 0.31], [-16.4, -3.2, 33, 0.27],
                [11.4, -5.1, 14, 0.35], [15.2, -3.7, 25, 0.29], [8.6, -6.3, 36, 0.26],
                [-17.2, 1.9, 40, 0.24], [16.7, 2.2, 43, 0.24], [-15.8, -1.5, 48, 0.22],
                [14.8, -1.9, 51, 0.22], [-11.8, 6.8, 55, 0.2], [12.8, 6.6, 58, 0.2],
                [-12.6, -6.9, 57, 0.2], [13.2, -6.7, 60, 0.2], [-18.3, 0.1, 63, 0.18],
                [18.6, 0.5, 66, 0.18], [-7.8, 7.2, 70, 0.17], [8.2, -7.2, 72, 0.17]
            ];
            const extendedFormationCenters = formationCenters.concat(formationCenters.map((center, index) => {
                const side = index % 2 === 0 ? 1 : -1;
                return [
                    center[0] + side * randomRange(1.4, 2.8),
                    center[1] + randomRange(-0.7, 0.7),
                    center[2] + randomRange(2.4, 6.4),
                    center[3] * randomRange(0.88, 1.05)
                ];
            })).concat(formationCenters.map((center, index) => {
                const side = index % 2 === 0 ? -1 : 1;
                return [
                    center[0] + side * randomRange(3.1, 4.8),
                    center[1] + randomRange(-1.0, 1.0),
                    center[2] + randomRange(5.8, 10.5),
                    center[3] * randomRange(0.78, 0.96)
                ];
            }));
            extendedFormationCenters.unshift([12.5, 1.25, 5.2, 0.5]);
            const speedMultipliers = [1, 0.8, 0.6];
            const formationShapes = {
                v: [
                    [0, 0, 0],
                    [0.78, 0.42, -0.34],
                    [0.78, -0.42, -0.34],
                    [1.58, 0.82, -0.74],
                    [1.58, -0.82, -0.74]
                ],
                vWide: [
                    [0, 0, 0],
                    [0.88, 0.12, 0.66],
                    [0.88, -0.12, -0.66],
                    [1.74, 0.18, 1.32],
                    [1.74, -0.18, -1.32]
                ],
                echelon: [
                    [0, 0, 0],
                    [0.62, -0.38, -0.24],
                    [1.24, -0.76, -0.48],
                    [1.86, -1.14, -0.72],
                    [2.48, -1.52, -0.96]
                ],
                echelonWide: [
                    [0, 0, 0],
                    [0.72, -0.1, 0.62],
                    [1.44, -0.2, 1.24],
                    [2.16, -0.3, 1.86],
                    [2.88, -0.4, 2.48]
                ]
            };
            extendedFormationCenters.forEach((center, formationIndex) => {
                const pathSpeed = formationIndex === 0
                    ? 3.05
                    : randomRange(0.68, 1.35) * speedMultipliers[formationIndex % speedMultipliers.length];
                const phase = randomRange(0, Math.PI * 2);
                const pathOffset = formationIndex === 0 ? -2.75 : randomRange(-8, 22);
                const isWide = Math.random() < 0.8;
                const isV = Math.random() < 0.7;
                const formationOffsets = isV
                    ? (isWide ? formationShapes.vWide : formationShapes.v)
                    : (isWide ? formationShapes.echelonWide : formationShapes.echelon);
                const mirrorY = center[1] < 0 ? -1 : 1;
                const mirrorZ = center[0] < 0 ? -1 : 1;
                formationOffsets.forEach((offset, memberIndex) => {
                    const x = center[0] + offset[0] + randomRange(-0.06, 0.06);
                    const y = center[1] + offset[1] * mirrorY + randomRange(-0.04, 0.04);
                    const z = center[2] + offset[2] * mirrorZ;
                    const fighter = placeShip(
                        "fighter",
                        `imperialFighter${formationIndex}_${memberIndex}`,
                        new BABYLON.Vector3(x, y, z),
                        center[3],
                        fleetRoot,
                        BABYLON.Vector3.Zero()
                    );
                    if (fighter) {
                        fighter.metadata.pathSpeed = pathSpeed;
                        fighter.metadata.baseX = x;
                        fighter.metadata.baseZ = z;
                        fighter.metadata.pathOffset = pathOffset + memberIndex * 0.18;
                        fighter.metadata.laneDrift = 0.08;
                        fighter.metadata.phase = phase;
                        fighter.metadata.isForegroundPass = formationIndex === 0;
                        fighterNodes.push(fighter);
                        addEngineGlow(fighter, -0.36, -0.03, 0.02, 0.28);
                    }
                });
            });
        }

        function showCaption(text) {
            if (!text) {
                captionEl.classList.remove("isVisible");
                return;
            }
            captionTextEl.textContent = text;
            captionEl.classList.add("isVisible");
        }

        function resetIntro() {
            for (let i = spawned.length - 1; i >= 0; i -= 1) {
                if (spawned[i].isDisposed && spawned[i].isDisposed()) {
                    spawned.splice(i, 1);
                }
            }
            introTime = 0;
            cameraMode = "auto";
            manualCaptionIndex = null;
            showCaption("");
            buildFleet();
        }

        function setFleetCamera() {
            camera.position.set(-14.2, 3.1, -11.0);
            camera.setTarget(new BABYLON.Vector3(-3.2, 0.25, 18));
            camera.fov = BABYLON.Tools.ToRadians(48);
        }

        function setSideCamera() {
            camera.position.set(-3.7, 1.65, -6.7);
            camera.setTarget(new BABYLON.Vector3(2.8, 0.25, 16.5));
            camera.fov = BABYLON.Tools.ToRadians(52);
        }

        function updateAutoCamera() {
            if (cameraMode !== "auto") {
                return;
            }
            if (introTime < 5.1) {
                const t = Math.min(1, introTime / 5.1);
                camera.position.set(
                    BABYLON.Scalar.Lerp(-14.8, -12.2, t),
                    BABYLON.Scalar.Lerp(3.25, 2.62, t),
                    BABYLON.Scalar.Lerp(-12.4, -8.8, t)
                );
                camera.setTarget(new BABYLON.Vector3(
                    BABYLON.Scalar.Lerp(-3.8, -2.4, t),
                    BABYLON.Scalar.Lerp(0.45, 0.08, t),
                    BABYLON.Scalar.Lerp(19, 17, t)
                ));
                camera.fov = BABYLON.Tools.ToRadians(BABYLON.Scalar.Lerp(52, 43, easeInOut(t)));
                return;
            }

            const t = Math.min(1, (introTime - 5.1) / 3.6);
            camera.position.set(
                BABYLON.Scalar.Lerp(-12.2, -11.4, easeInOut(t)),
                BABYLON.Scalar.Lerp(2.62, 2.35, easeInOut(t)),
                BABYLON.Scalar.Lerp(-8.8, -7.9, easeInOut(t))
            );
            camera.setTarget(new BABYLON.Vector3(
                BABYLON.Scalar.Lerp(
                    BABYLON.Scalar.Lerp(-2.4, -1.5, easeInOut(t)),
                    -3.4,
                    easeInOut(Math.min(1, Math.max(0, (introTime - 7.69) / 72)))
                ),
                BABYLON.Scalar.Lerp(0.08, 0.12, easeInOut(t)),
                BABYLON.Scalar.Lerp(17, 16.2, easeInOut(t))
            ));
            camera.fov = BABYLON.Tools.ToRadians(BABYLON.Scalar.Lerp(43, 45, easeInOut(t)));
        }

        function updateCaptions() {
            if (manualCaptionIndex !== null) {
                showCaption(introCaptions[manualCaptionIndex] || "");
                return;
            }
            if (introTime < 1.0) {
                showCaption("");
            } else if (introTime < 4.3) {
                showCaption(introCaptions[0]);
            } else if (introTime < 6.5) {
                showCaption(introCaptions[1]);
            } else {
                showCaption("");
            }
        }

        function getAutoCaptionIndex() {
            if (introTime < 1.0) {
                return -1;
            }
            if (introTime < 4.3) {
                return 0;
            }
            if (introTime < 6.5) {
                return 1;
            }
            return introCaptions.length;
        }

        function advanceDialogue() {
            const currentIndex = manualCaptionIndex !== null ? manualCaptionIndex : getAutoCaptionIndex();
            const nextIndex = currentIndex + 1;
            if (nextIndex >= introCaptions.length) {
                showCaption("");
                return false;
            }
            manualCaptionIndex = nextIndex;
            showCaption(introCaptions[manualCaptionIndex]);
            return true;
        }

        function updateScene(delta) {
            introTime += delta;
            updateAutoCamera();
            updateCaptions();

            spawned.forEach((node) => {
                if (!node.metadata) {
                    return;
                }
                node.position.y = node.metadata.baseY + Math.sin(introTime * node.metadata.drift) * node.metadata.driftAmount;
                if (node.metadata.pathSpeed > 0) {
                    const progress = introTime * node.metadata.pathSpeed + node.metadata.pathOffset;
                    node.position.x = node.metadata.baseX - progress
                        + Math.sin(introTime * 0.9 + node.metadata.phase) * node.metadata.laneDrift;
                    node.position.z = node.metadata.baseZ + progress * 0.08;
                    if (node.metadata.isForegroundPass) {
                        node.position.z = node.metadata.baseZ + progress * 0.035;
                    }
                }
            });

            scene.meshes.forEach((mesh) => {
                if (mesh.name === "engineGlow" && mesh.metadata) {
                    const pulse = 1 + Math.sin(introTime * 18 + mesh.position.x * 3) * 0.18;
                    mesh.scaling.setAll(mesh.metadata.baseScale * pulse);
                }
                if (mesh.name === "star" && mesh.metadata) {
                    const pulse = 0.85 + Math.sin(introTime * mesh.metadata.twinkle) * 0.15;
                    mesh.scaling.setAll(mesh.metadata.base * pulse);
                }
            });
        }

        async function boot() {
            createStarfield();
            await Promise.all([
                loadTemplate("fighter", "model/からあげ戦闘機.glb", 2.2, new BABYLON.Vector3(0, BABYLON.Tools.ToRadians(240), BABYLON.Tools.ToRadians(10))),
                loadTemplate("disk", "model/からあげ円盤.glb", 4.5, new BABYLON.Vector3(0, BABYLON.Tools.ToRadians(240), BABYLON.Tools.ToRadians(10))),
                loadTemplate("battleship", "model/からあげ大戦艦.glb", 6.5, new BABYLON.Vector3(0, BABYLON.Tools.ToRadians(240), BABYLON.Tools.ToRadians(10)))
            ]);
            if (disposed) {
                return;
            }
            resetIntro();
            engine.runRenderLoop(() => {
                if (disposed) {
                    return;
                }
                const delta = engine.getDeltaTime() / 1000;
                updateScene(Math.min(delta, 0.033));
                scene.render();
            });
        }

        if (replayButton) replayButton.addEventListener("click", resetIntro);
        if (fleetButton) fleetButton.addEventListener("click", () => {
            cameraMode = "fleet";
            setFleetCamera();
            showCaption("見えたか？\nあれが、からあげ帝国主力艦隊だ。");
        });
        if (sideButton) sideButton.addEventListener("click", () => {
            cameraMode = "side";
            setSideCamera();
            showCaption("からあげ帝国主力艦隊、前進中。");
        });

        const resizeHandler = () => engine.resize();
        window.addEventListener("resize", resizeHandler);

        boot().catch((error) => {
            if (disposed) {
                return;
            }
            console.error(error);
            showCaption("モデル読み込みに失敗しました。\nローカルサーバー経由で開いてください。");
        });

        return {
            engine,
            scene,
            reset: resetIntro,
            advanceDialogue,
            dispose() {
                disposed = true;
                window.removeEventListener("resize", resizeHandler);
                engine.stopRenderLoop();
                scene.dispose();
                engine.dispose();
                if (captionEl) {
                    captionEl.classList.remove("isVisible");
                }
            }
        };
    }

    global.Stage3FleetIntro = {
        create: createStage3FleetIntro
    };
})(window);

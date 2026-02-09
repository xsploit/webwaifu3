import * as THREE from 'three';

export interface SceneRefs {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	key: THREE.DirectionalLight;
	fill: THREE.DirectionalLight;
	rim: THREE.DirectionalLight;
	hemi: THREE.HemisphereLight;
	ambient: THREE.AmbientLight;
	clock: THREE.Clock;
}

export function createScene(canvas: HTMLCanvasElement): SceneRefs {
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: false
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setClearColor(0x02040a, 1);
	renderer.autoClear = true;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 0.85;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.shadowMap.enabled = false;

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
	camera.position.set(0, 1.45, 3.2);
	camera.lookAt(0, 1.4, 0);
	scene.add(camera);

	const key = new THREE.DirectionalLight(0xffffff, 0.8);
	key.position.set(1.5, 2.2, 1.2);

	const fill = new THREE.DirectionalLight(0xbad1ff, 0.3);
	fill.position.set(-1.4, 1.5, -1.0);

	const rim = new THREE.DirectionalLight(0x8fbaff, 0.35);
	rim.position.set(-1.2, 2.0, -2.0);

	const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x1c1f26, 0.35);

	const ambient = new THREE.AmbientLight(0xffffff, 0.35);

	scene.add(key, fill, rim, hemi, ambient);

	const clock = new THREE.Clock();

	return { renderer, scene, camera, key, fill, rim, hemi, ambient, clock };
}

export function resizeScene(refs: SceneRefs) {
	const { renderer, camera } = refs;
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

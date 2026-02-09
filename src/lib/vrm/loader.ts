import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { VRM } from '@pixiv/three-vrm';

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser, { expressionPlugin: undefined }));

export async function loadVrm(url: string): Promise<VRM> {
	const gltf = await loader.loadAsync(url);
	const vrm = gltf.userData.vrm as VRM;
	if (!vrm) throw new Error('Not a VRM file');

	if (VRMUtils.removeUnnecessaryVertices) VRMUtils.removeUnnecessaryVertices(vrm.scene);
	if (VRMUtils.combineSkeletons) {
		VRMUtils.combineSkeletons(vrm.scene);
	} else if (VRMUtils.removeUnnecessaryJoints) {
		VRMUtils.removeUnnecessaryJoints(vrm.scene);
	}
	if ((VRMUtils as any).rotateVRM0) (VRMUtils as any).rotateVRM0(vrm);

	vrm.scene.traverse((obj) => {
		if ((obj as THREE.Mesh).isMesh) {
			obj.frustumCulled = false;
		}
	});

	vrm.scene.position.set(0, 0.5, 0);
	vrm.scene.rotation.set(0, Math.PI, 0);
	vrm.scene.scale.set(1.0, 1.0, 1.0);

	return vrm;
}

export { loader as gltfLoader };

// Material helpers
export function makePhysicalFrom(
	oldMat: THREE.Material & { [key: string]: any },
	envMap: THREE.Texture | null
): THREE.Material {
	if (oldMat.emissiveMap && !oldMat.map) return oldMat;
	const map = oldMat.map ?? oldMat.uniforms?.mainTexture?.value ?? null;
	const normalMap = oldMat.normalMap ?? oldMat.uniforms?.normalMap?.value ?? null;
	const emissiveMap = oldMat.emissiveMap ?? oldMat.uniforms?.emissiveMap?.value ?? null;
	const emissive =
		oldMat.emissive && oldMat.emissive.clone
			? oldMat.emissive.clone()
			: new THREE.Color(0x000000);
	const emissiveIntensity =
		oldMat.emissiveIntensity !== undefined ? oldMat.emissiveIntensity : 1.0;
	const color =
		oldMat.color && oldMat.color.clone ? oldMat.color.clone() : new THREE.Color(0.9, 0.85, 0.82);

	return new THREE.MeshPhysicalMaterial({
		map: map || undefined,
		normalMap: normalMap || undefined,
		color: map ? 0xffffff : color,
		emissive,
		emissiveMap: emissiveMap || undefined,
		emissiveIntensity,
		roughness: 0.45,
		metalness: 0.0,
		transmission: 0.0,
		thickness: 0.0,
		envMap: envMap || undefined,
		envMapIntensity: envMap ? 1.0 : 0.0,
		clearcoat: envMap ? 0.3 : 0.0,
		clearcoatRoughness: 0.4,
		specularIntensity: 0.5,
		side: oldMat.side !== undefined ? oldMat.side : THREE.FrontSide,
		depthWrite: oldMat.depthWrite !== undefined ? oldMat.depthWrite : true,
		transparent: !!oldMat.transparent,
		alphaTest: oldMat.alphaTest !== undefined ? oldMat.alphaTest : 0
	});
}

export function setRealisticMode(
	root: THREE.Object3D,
	envMap: THREE.Texture | null,
	enable: boolean
) {
	root.traverse((obj) => {
		if (!(obj as THREE.Mesh).isMesh || !(obj as THREE.Mesh).material) return;
		const name = obj.name?.toLowerCase() || '';
		if (name.includes('eye') || name.includes('iris') || name.includes('lash')) return;

		const mesh = obj as THREE.Mesh;
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

		if (enable) {
			if (!(mesh.userData as any).originalMaterials)
				(mesh.userData as any).originalMaterials = mats.slice();
			const newMats = mats.map((m) => makePhysicalFrom(m as any, envMap));
			mesh.material = newMats.length === 1 ? newMats[0] : newMats;
		} else if ((mesh.userData as any).originalMaterials) {
			// Dispose the MeshPhysicalMaterials we created (they aren't in originals)
			const origSet = new Set((mesh.userData as any).originalMaterials);
			for (const m of mats) {
				if (!origSet.has(m)) m.dispose();
			}
			const orig = (mesh.userData as any).originalMaterials;
			mesh.material = orig.length === 1 ? orig[0] : orig;
		}
	});
}

export function applyToonRim(material: THREE.Material & { [key: string]: any }) {
	if (!material || material.__toonRimPatched) return;
	if ((material as any).isShaderMaterial) return;
	material.__toonRimPatched = true;
	material.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
		shader.uniforms.uRimColor = { value: new THREE.Color(0.55, 0.75, 1.0) };
		shader.uniforms.uRimStrength = { value: 0.25 };
		shader.uniforms.uShadeSteps = { value: 4.0 };
		shader.fragmentShader =
			`#define saturate(a) clamp(a, 0.0, 1.0)\n` +
			shader.fragmentShader.replace(
				'#include <output_fragment>',
				`
          vec3 toonColor = outgoingLight;
          float shade = floor(toonColor.r * uShadeSteps) / uShadeSteps;
          toonColor = mix(toonColor, vec3(shade), 0.35);
          float rim = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.2);
          toonColor += rim * uRimStrength * uRimColor;
          outgoingLight = toonColor;
          #include <output_fragment>
        `
			);
	};
	material.needsUpdate = true;
}

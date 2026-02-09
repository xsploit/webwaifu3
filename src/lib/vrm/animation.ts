import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { VRM } from '@pixiv/three-vrm';
import { gltfLoader } from './loader.js';

// Mixamo to VRM humanoid bone map (from three-vrm examples)
export const mixamoVRMRigMap: Record<string, string> = {
	mixamorigHips: 'hips',
	mixamorigSpine: 'spine',
	mixamorigSpine1: 'chest',
	mixamorigSpine2: 'upperChest',
	mixamorigNeck: 'neck',
	mixamorigHead: 'head',
	mixamorigLeftShoulder: 'leftShoulder',
	mixamorigLeftArm: 'leftUpperArm',
	mixamorigLeftForeArm: 'leftLowerArm',
	mixamorigLeftHand: 'leftHand',
	mixamorigLeftHandThumb1: 'leftThumbProximal',
	mixamorigLeftHandThumb2: 'leftThumbIntermediate',
	mixamorigLeftHandThumb3: 'leftThumbDistal',
	mixamorigLeftHandIndex1: 'leftIndexProximal',
	mixamorigLeftHandIndex2: 'leftIndexIntermediate',
	mixamorigLeftHandIndex3: 'leftIndexDistal',
	mixamorigLeftHandMiddle1: 'leftMiddleProximal',
	mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
	mixamorigLeftHandMiddle3: 'leftMiddleDistal',
	mixamorigLeftHandRing1: 'leftRingProximal',
	mixamorigLeftHandRing2: 'leftRingIntermediate',
	mixamorigLeftHandRing3: 'leftRingDistal',
	mixamorigLeftHandPinky1: 'leftLittleProximal',
	mixamorigLeftHandPinky2: 'leftLittleIntermediate',
	mixamorigLeftHandPinky3: 'leftLittleDistal',
	mixamorigRightShoulder: 'rightShoulder',
	mixamorigRightArm: 'rightUpperArm',
	mixamorigRightForeArm: 'rightLowerArm',
	mixamorigRightHand: 'rightHand',
	mixamorigRightHandThumb1: 'rightThumbProximal',
	mixamorigRightHandThumb2: 'rightThumbIntermediate',
	mixamorigRightHandThumb3: 'rightThumbDistal',
	mixamorigRightHandIndex1: 'rightIndexProximal',
	mixamorigRightHandIndex2: 'rightIndexIntermediate',
	mixamorigRightHandIndex3: 'rightIndexDistal',
	mixamorigRightHandMiddle1: 'rightMiddleProximal',
	mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
	mixamorigRightHandMiddle3: 'rightMiddleDistal',
	mixamorigRightHandRing1: 'rightRingProximal',
	mixamorigRightHandRing2: 'rightRingIntermediate',
	mixamorigRightHandRing3: 'rightRingDistal',
	mixamorigRightHandPinky1: 'rightLittleProximal',
	mixamorigRightHandPinky2: 'rightLittleIntermediate',
	mixamorigRightHandPinky3: 'rightLittleDistal',
	mixamorigLeftUpLeg: 'leftUpperLeg',
	mixamorigLeftLeg: 'leftLowerLeg',
	mixamorigLeftFoot: 'leftFoot',
	mixamorigLeftToeBase: 'leftToes',
	mixamorigRightUpLeg: 'rightUpperLeg',
	mixamorigRightLeg: 'rightLowerLeg',
	mixamorigRightFoot: 'rightFoot',
	mixamorigRightToeBase: 'rightToes'
};

// Simple bone map for retargeting generic FBX
const simpleBoneMap: Record<string, string> = {
	Hips: 'J_Bip_C_Hips',
	Spine: 'J_Bip_C_Spine',
	Spine1: 'J_Bip_C_Chest',
	Spine2: 'J_Bip_C_UpperChest',
	Neck: 'J_Bip_C_Neck',
	Head: 'J_Bip_C_Head',
	LeftShoulder: 'J_Bip_L_Shoulder',
	LeftArm: 'J_Bip_L_UpperArm',
	LeftForeArm: 'J_Bip_L_LowerArm',
	LeftHand: 'J_Bip_L_Hand',
	RightShoulder: 'J_Bip_R_Shoulder',
	RightArm: 'J_Bip_R_UpperArm',
	RightForeArm: 'J_Bip_R_LowerArm',
	RightHand: 'J_Bip_R_Hand',
	LeftUpLeg: 'J_Bip_L_UpperLeg',
	LeftLeg: 'J_Bip_L_LowerLeg',
	LeftFoot: 'J_Bip_L_Foot',
	RightUpLeg: 'J_Bip_R_UpperLeg',
	RightLeg: 'J_Bip_R_LowerLeg',
	RightFoot: 'J_Bip_R_Foot'
};

const fbxLoader = new FBXLoader();

export async function loadMixamoAnimation(
	url: string,
	vrm: VRM
): Promise<THREE.AnimationClip | null> {
	const asset = await fbxLoader.loadAsync(url);
	const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com');
	if (!clip) return null;

	const tracks: THREE.KeyframeTrack[] = [];
	const restRotationInverse = new THREE.Quaternion();
	const parentRestWorldRotation = new THREE.Quaternion();
	const _quatA = new THREE.Quaternion();
	const _vec3 = new THREE.Vector3();

	const motionHipsHeight = asset.getObjectByName('mixamorigHips')?.position.y ?? 1;
	const vrmHipsY =
		vrm.humanoid?.getNormalizedBoneNode('hips')?.getWorldPosition(_vec3).y ?? 0;
	const vrmRootY = vrm.scene.getWorldPosition(_vec3).y;
	const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY);
	const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

	clip.tracks.forEach((track) => {
		const trackSplitted = track.name.split('.');
		const mixamoRigName = trackSplitted[0];
		const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
		const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
		const mixamoRigNode = asset.getObjectByName(mixamoRigName);

		if (vrmNodeName != null && mixamoRigNode) {
			const propertyName = trackSplitted[1];

			mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
			mixamoRigNode.parent!.getWorldQuaternion(parentRestWorldRotation);

			if (track instanceof THREE.QuaternionKeyframeTrack) {
				for (let i = 0; i < track.values.length; i += 4) {
					_quatA.set(track.values[i], track.values[i + 1], track.values[i + 2], track.values[i + 3]);
					_quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
					track.values[i] = _quatA.x;
					track.values[i + 1] = _quatA.y;
					track.values[i + 2] = _quatA.z;
					track.values[i + 3] = _quatA.w;
				}

				tracks.push(
					new THREE.QuaternionKeyframeTrack(
						`${vrmNodeName}.${propertyName}`,
						track.times,
						track.values.map((v, i) =>
							vrm.meta?.metaVersion === '0' && i % 2 === 0 ? -v : v
						)
					)
				);
			} else if (track instanceof THREE.VectorKeyframeTrack) {
				// Compute position as delta from Mixamo rest pose, scaled, then offset to VRM rest
				// This prevents animations with different rest hips heights from pushing the VRM up
				const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName);
				const vrmRestX = vrmNode ? vrmNode.position.x : 0;
				const vrmRestY = vrmNode ? vrmNode.position.y : 0;
				const vrmRestZ = vrmNode ? vrmNode.position.z : 0;
				const mixRestX = mixamoRigNode.position.x;
				const mixRestY = mixamoRigNode.position.y;
				const mixRestZ = mixamoRigNode.position.z;

				const value = new Float32Array(track.values.length);
				for (let i = 0; i < track.values.length; i += 3) {
					let dx = track.values[i] - mixRestX;
					let dy = track.values[i + 1] - mixRestY;
					let dz = track.values[i + 2] - mixRestZ;
					if (vrm.meta?.metaVersion === '0') { dx = -dx; dz = -dz; }
					value[i] = vrmRestX + dx * hipsPositionScale;
					value[i + 1] = vrmRestY + dy * hipsPositionScale;
					value[i + 2] = vrmRestZ + dz * hipsPositionScale;
				}

				tracks.push(
					new THREE.VectorKeyframeTrack(
						`${vrmNodeName}.${propertyName}`,
						track.times,
						value
					)
				);
			}
		}
	});

	return tracks.length > 0 ? new THREE.AnimationClip('vrmAnimation', clip.duration, tracks) : null;
}

export function retargetClip(clip: THREE.AnimationClip, vrm: VRM): THREE.AnimationClip | null {
	if (!clip || !vrm) return null;
	const have = new Set<string>();
	vrm.scene.traverse((o) => have.add(o.name));
	const out = clip.clone();
	out.tracks = out.tracks.filter((t) => {
		const [node, rest] = t.name.split('.');
		const mapped = simpleBoneMap[node] ?? node;
		if (!have.has(mapped)) return false;
		t.name = `${mapped}.${rest}`;
		return true;
	});
	return out.tracks.length ? out : null;
}

// Animation crossfading
let currentAction: THREE.AnimationAction | null = null;
let previousAction: THREE.AnimationAction | null = null;

export function crossfadeToAction(
	newAction: THREE.AnimationAction,
	duration = 1.0,
	timeScale = 1.0
) {
	if (previousAction) previousAction.fadeOut(duration);
	if (currentAction) {
		currentAction.fadeOut(duration);
		previousAction = currentAction;
	}

	newAction.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(duration).play();
	currentAction = newAction;
}

export function getCurrentAction() {
	return currentAction;
}

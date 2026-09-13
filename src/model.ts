import type { MuscleGroup, Values, Side } from './types.ts';

export const MIN_SIZE = 0.25;
export const MAX_SIZE = 10;
// Log spacing retains fine control near reference while allowing dramatic enlargement.
export const sizeToSlider = (size: number) => Math.log(size / MIN_SIZE) / Math.log(MAX_SIZE / MIN_SIZE) * 100;
export const sliderToSize = (position: number) => clampSize(MIN_SIZE * Math.pow(MAX_SIZE / MIN_SIZE, position / 100));
export const STORAGE_KEY = 'form-physique-v1';
export const clampSize = (n: number) => Math.round(Math.max(MIN_SIZE, Math.min(MAX_SIZE, n)) * 100) / 100;
export const keyFor = (id: string, side: Side) => `${id}:${side}`;
export const getSize = (values: Values, id: string, side: Side) => values[keyFor(id,side)] ?? 1;
export function deformMusclePositions(raw: Float32Array, center: number[], axis: number[], volume: number): Float32Array {
  const result=new Float32Array(raw.length);const factor=Math.sqrt(volume)-1;
  for(let i=0;i<raw.length;i+=3){
    const dx=raw[i]-center[0],dy=raw[i+1]-center[1],dz=raw[i+2]-center[2];
    const dot=dx*axis[0]+dy*axis[1]+dz*axis[2];
    result[i]=raw[i]+(dx-dot*axis[0])*factor;
    result[i+1]=raw[i+1]+(dy-dot*axis[1])*factor;
    result[i+2]=raw[i+2]+(dz-dot*axis[2])*factor;
  }
  return result;
}
export function setSize(values: Values, group: MuscleGroup, side: Side|'both', size: number): Values {
  const next = { ...values };
  const sides = side === 'both' ? group.sides : [side];
  for (const s of sides) {
    if (!group.sides.includes(s)) continue;
    const key = keyFor(group.id,s);
    if (clampSize(size) === 1) delete next[key];
    else next[key] = clampSize(size);
  }
  return next;
}
export function validateShape(input: unknown, groups: MuscleGroup[]): Values {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('This is not a saved shape file.');
  const doc=input as Record<string,unknown>;
  if (doc.version !== 1 || doc.app !== 'FORM' || !doc.values || typeof doc.values !== 'object' || Array.isArray(doc.values)) throw new Error('Choose a shape exported from Learn Your Physique.');
  const valid = new Set(groups.filter(g=>!g.support).flatMap(g=>g.sides.map(s=>keyFor(g.id,s))));
  const result: Values = {};
  for (const [key,value] of Object.entries(doc.values)) {
    if (!valid.has(key) || typeof value !== 'number' || !Number.isFinite(value) || value < MIN_SIZE || value > MAX_SIZE) throw new Error('This shape contains an unknown muscle or an invalid size.');
    if (value !== 1) result[key]=clampSize(value);
  }
  return result;
}
export function serializeShape(values: Values) {
  return { app: 'FORM', version: 1, model: 'BodyParts3D + Z-Anatomy', values };
}

export const regions = [
  {id:'shoulders',name:'Shoulders',hint:'Deltoids & rotator cuff'},
  {id:'chest',name:'Chest',hint:'Pectorals & subclavius'},
  {id:'back',name:'Back',hint:'Lats, traps & spinal muscles'},
  {id:'arms',name:'Upper arms',hint:'Biceps, triceps & brachialis'},
  {id:'forearms',name:'Forearms',hint:'Flexors, extensors & rotators'},
  {id:'core',name:'Core & thorax',hint:'Abdominals & breathing muscles'},
  {id:'hips',name:'Hips & glutes',hint:'Gluteals, hip rotators & pelvic floor'},
  {id:'thighs',name:'Thighs',hint:'Quadriceps, hamstrings & adductors'},
  {id:'legs',name:'Lower legs',hint:'Calves & shin muscles'},
  {id:'hands',name:'Hands',hint:'Small muscles of the hand'},
  {id:'feet',name:'Feet',hint:'Small muscles of the foot'},
  {id:'head',name:'Head & neck',hint:'Face, eyes, jaw, throat & neck'},
];

export function muscleDetails(group: MuscleGroup) {
  const n=group.anatomicalName;
  const matches: [RegExp,string,string,string[]][] = [
    [/acromial part of deltoid/, 'Adds fullness to the outer shoulder, making the upper body appear wider from the front and back.', 'Raises the arm out to the side.', ['Lateral raise','Cable lateral raise']],
    [/clavicular part of deltoid/, 'Adds fullness to the front of the shoulder, especially in a side or three-quarter view.', 'Helps raise the arm forward and rotate it inward.', ['Overhead press','Front raise']],
    [/spinal part of deltoid/, 'Builds the rear shoulder contour and adds depth behind the upper arm.', 'Moves the arm backward and helps rotate it outward.', ['Reverse fly','Rear-delt row']],
    [/clavicular part of pectoralis/, 'Adds upper chest fullness below the collarbone. Its appearance also depends on the rib cage and surrounding tissue.', 'Helps bring the arm forward and across the body.', ['Incline press','Low-to-high cable fly']],
    [/pectoralis major/, 'Adds thickness to the chest and changes its front and side contours.', 'Brings the arm toward and across the body.', ['Chest press','Push-up','Cable fly']],
    [/latissimus/, 'Adds width at the sides of the back and fullness beneath the armpits, influencing the torso’s taper.', 'Pulls the upper arm down and back toward the body.', ['Pulldown','Pull-up','Row']],
    [/descending part of trapezius/, 'Builds the slope between the neck and shoulders, most visible from the front and back.', 'Elevates and helps upwardly rotate the shoulder blade.', ['Shrug','Loaded carry']],
    [/trapezius|rhomboid/, 'Adds depth around the shoulder blades. Position and posture also influence this area’s appearance.', 'Helps control the position of the shoulder blade.', ['Row','Prone raise']],
    [/biceps brachii/, 'Adds fullness to the front of the upper arm. The outline of the muscle is also shaped by its attachments.', 'Bends the elbow and turns the palm upward.', ['Supinated curl','Chin-up']],
    [/triceps/, 'Adds thickness to the back of the upper arm, contributing to its overall circumference.', 'Straightens the elbow.', ['Triceps extension','Pressdown','Close-grip press']],
    [/brachialis/, 'Adds thickness beneath the biceps and along the lower portion of the upper arm.', 'Bends the elbow.', ['Hammer curl','Elbow-flexion exercises']],
    [/rectus abdominis/, 'Adds thickness to the front abdominal wall. Visible separation also depends on body fat and natural tendon intersections.', 'Flexes the trunk and helps control the pelvis.', ['Controlled crunch','Reverse crunch']],
    [/external oblique|internal oblique/, 'Adds thickness at the sides of the waist. Training this muscle does not selectively remove fat over it.', 'Helps rotate and bend the trunk and resist movement.', ['Side plank','Cable rotation']],
    [/serratus anterior/, 'Can add detail along the upper ribs, depending on surrounding tissue and the position of the arm.', 'Moves the shoulder blade forward and assists upward rotation.', ['Push-up plus','Serratus punch']],
    [/gluteus maximus/, 'Adds projection and fullness to the buttocks, especially in a side or rear view.', 'Extends and externally rotates the hip.', ['Hip thrust','Squat','Split squat']],
    [/gluteus medius/, 'Adds fullness to the upper outer hip. Pelvic width remains part of the underlying structure.', 'Abducts the hip and stabilizes the pelvis.', ['Hip abduction','Single-leg exercises']],
    [/vastus lateralis/, 'Adds fullness to the outside of the thigh, influencing its lateral sweep.', 'Straightens the knee.', ['Squat','Leg press','Knee extension']],
    [/vastus medialis/, 'Adds fullness to the inner front thigh above the knee.', 'Straightens the knee and contributes to patellar control.', ['Squat','Knee extension']],
    [/rectus femoris|vastus intermedius/, 'Adds depth to the front of the thigh. The intermedius sits beneath the rectus femoris.', 'Contributes to straightening the knee.', ['Knee extension','Squat']],
    [/biceps femoris|semitendinosus|semimembranosus/, 'Adds thickness to the rear thigh, most visible from the side and back.', 'Contributes to knee flexion; most portions also extend the hip.', ['Leg curl','Hip hinge']],
    [/adductor magnus|adductor longus|adductor brevis|gracilis/, 'Adds fullness along the inner thigh.', 'Helps bring the thigh toward the midline.', ['Hip adduction','Squat variations']],
    [/gastrocnemius/, 'Adds fullness to the upper calf and changes its rear and side contours.', 'Points the foot down and helps bend the knee.', ['Standing calf raise']],
    [/soleus/, 'Adds depth beneath the gastrocnemius and fullness lower down the calf.', 'Points the foot down.', ['Seated calf raise','Standing calf raise']],
    [/tibialis anterior/, 'Adds modest fullness to the front and outer edge of the shin.', 'Lifts the foot toward the shin and turns the sole inward.', ['Tibialis raise']],
    [/brachioradialis/, 'Adds fullness to the upper outer forearm, especially with the elbow bent.', 'Helps bend the elbow.', ['Hammer curl','Reverse curl']],
    [/sternocleidomastoid/, 'Changes the visible contour running from behind the ear toward the collarbone.', 'Helps bend and rotate the neck.', []],
  ];
  for (const [pattern,effect,action,examples] of matches) if (pattern.test(n)) return {effect,action,examples,minor:false};
  const fine=['head','hands','feet'].includes(group.region);
  return {
    effect: fine ? 'This small structure contributes to local contour and fine movement. Changing its size has little effect on the overall physique; isolate it to inspect the geometry.' : group.superficial ? 'Changes the local surface contour. The visible result also depends on neighbouring muscles, tissue coverage, and skeletal proportions.' : 'This muscle sits partly or entirely beneath other structures. Its size can change without producing a distinct visible bulge. Use the see-through or isolate controls to inspect it.',
    action: fine ? 'Part of the region’s fine movement and control system.' : 'Works together with neighbouring muscles in movement and stability.',
    examples:[] as string[],minor:true,
  };
}

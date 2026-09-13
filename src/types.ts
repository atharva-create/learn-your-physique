export type Side = 'left' | 'right' | 'center';
export type Values = Record<string, number>;
export type ViewMode = 'anatomy' | 'skin';
export type NavigationMode = 'rotate' | 'pan';
export type FocusArea = 'head' | 'chest' | 'core' | 'legs';
export interface MuscleGroup {
  id: string; name: string; anatomicalName: string; region: string;
  superficial: boolean; support: boolean; meshNames: string[]; sources: string[]; sides: Side[];
}
export interface MeshInfo {
  name: string; group: string; side: Side; center: number[]; axis: number[];
  min: number[]; max: number[]; radius: number; support: boolean; source: string;
}
export interface Catalog {
  groups: MuscleGroup[]; meshes: MeshInfo[]; bounds: number[][];
  muscleMeshes: number; muscleControls: number;
}
export interface ViewerState {
  selected: string; values: Values; mode: ViewMode; xray: boolean;
  isolate: boolean; compare: boolean; side: 'both' | Side;
  navigation: NavigationMode;
}
export interface ViewerAPI {
  update: (state: ViewerState) => void;
  view: (name: 'front'|'back'|'left'|'right') => void;
  focus: () => void; resetCamera: () => void; zoom: (factor: number) => void;
  focusArea: (area: FocusArea) => void;
  dispose: () => void;
}

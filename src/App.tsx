import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, Focus, Hand, Layers2, Link2, LoaderCircle, Maximize, Minus, Move, PersonStanding, Plus, RotateCcw, Rotate3D, Search, SlidersHorizontal, Sparkles, Undo2, Upload, X } from 'lucide-react';
import type { Catalog, FocusArea, MuscleGroup, NavigationMode, Side, Values, ViewerAPI, ViewerState, ViewMode } from './types';
import { createViewer } from './viewer';
import { clampSize, getSize, MAX_SIZE, MIN_SIZE, muscleDetails, regions, serializeShape, setSize, sizeToSlider, sliderToSize, STORAGE_KEY, validateShape } from './model';

const INITIAL_SELECTION='acromial-part-of-deltoid';
const formatSize=(n:number)=>`${n.toFixed(2)}×`;

function ExactSize({value,onCommit}:{value:number;onCommit:(value:number)=>void}){
  const [draft,setDraft]=useState(value.toFixed(2));
  const cancelled=useRef(false);
  useEffect(()=>setDraft(value.toFixed(2)),[value]);
  const apply=()=>{
    if(!draft.trim()||!Number.isFinite(Number(draft))){setDraft(value.toFixed(2));return;}
    const next=clampSize(Number(draft));setDraft(next.toFixed(2));onCommit(next);
  };
  return <div className="exact-size"><label htmlFor="exact-size">Exact multiplier</label><div><input id="exact-size" type="number" min={MIN_SIZE} max={MAX_SIZE} step="0.01" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(cancelled.current)cancelled.current=false;else apply();}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){cancelled.current=true;setDraft(value.toFixed(2));e.currentTarget.blur();}}}/><span>×</span></div></div>;
}

function BodyViewer({catalog,state,onSelect,apiRef}: {catalog:Catalog;state:ViewerState;onSelect:(id:string)=>void;apiRef:React.RefObject<ViewerAPI|null>}) {
  const host=useRef<HTMLDivElement>(null);
  const current=useRef(state);current.current=state;
  const selectRef=useRef(onSelect);selectRef.current=onSelect;
  const [status,setStatus]=useState('loading');
  const [tooltip,setTooltip]=useState({label:'',x:0,y:0});
  useEffect(()=>{
    const controller=new AbortController();let instance:ViewerAPI|undefined;
    createViewer(host.current!,catalog,id=>selectRef.current(id),(label,x,y)=>setTooltip({label,x,y}),controller.signal)
      .then(api=>{if(controller.signal.aborted){api.dispose();return;}instance=api;apiRef.current=api;api.update(current.current);setStatus('ready');})
      .catch(error=>{if(error.name!=='AbortError'){console.error(error);setStatus('error');}});
    return ()=>{controller.abort();instance?.dispose();apiRef.current=null;};
  },[catalog,apiRef]);
  useEffect(()=>{apiRef.current?.update(state);},[state,apiRef]);
  return <>
    <div className="body-canvas" ref={host} />
    {status==='loading'&&<div className="viewer-status"><LoaderCircle className="spin" size={24}/><strong>Opening your muscle atlas</strong><span>Loading the 3D body. The first visit may take a moment…</span></div>}
    {status==='error'&&<div className="viewer-status error"><CircleHelp/><strong>The 3D model couldn’t load</strong><span>Check your connection and WebGL support, then try again.</span><button className="secondary-button" onClick={()=>window.location.reload()}>Reload model</button></div>}
    {status==='ready'&&tooltip.label&&<div className="muscle-tooltip" style={{left:Math.min(tooltip.x+16,(host.current?.clientWidth??400)-220),top:Math.max(12,tooltip.y-38)}}>{tooltip.label}</div>}
  </>;
}

export default function App() {
  const [catalog,setCatalog]=useState<Catalog|null>(null);
  const [loadError,setLoadError]=useState(false);
  const [selected,setSelected]=useState(INITIAL_SELECTION);
  const [region,setRegion]=useState('shoulders');
  const [query,setQuery]=useState('');
  const [values,setValues]=useState<Values>({});
  const [history,setHistory]=useState<Values[]>([]);
  const gesture=useRef<Values|null>(null);
  const [mode,setMode]=useState<ViewMode>('anatomy');
  const [side,setSide]=useState<'both'|Side>('both');
  const [xray,setXray]=useState(false);
  const [isolate,setIsolate]=useState(false);
  const [compare,setCompare]=useState(false);
  const [tab,setTab]=useState<'explore'|'changes'>('explore');
  const [view,setView]=useState('front');
  const [navigation,setNavigation]=useState<NavigationMode>('rotate');
  const [toast,setToast]=useState('');
  const [storageAvailable,setStorageAvailable]=useState(true);
  const viewerRef=useRef<ViewerAPI|null>(null);
  const aboutRef=useRef<HTMLDialogElement>(null);
  const uploadRef=useRef<HTMLInputElement>(null);
  const searchRef=useRef<HTMLInputElement>(null);
  const latestValues=useRef(values);latestValues.current=values;

  useEffect(()=>{
    let active=true;
    fetch(`${import.meta.env.BASE_URL}anatomy/catalog.json`).then(r=>{if(!r.ok)throw new Error('catalog');return r.json();}).then((data:Catalog)=>{
      if(!active)return;
      try{const stored=localStorage.getItem(STORAGE_KEY);if(stored)setValues(validateShape(JSON.parse(stored),data.groups));}
      catch{setToast('Your saved shape could not be restored. Starting from the reference body.');}
      setCatalog(data);
    }).catch(()=>{if(active)setLoadError(true);});
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(!catalog)return;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(serializeShape(values)));}
    catch{setStorageAvailable(false);}
  },[values,catalog]);
  useEffect(()=>{if(!toast)return;const id=window.setTimeout(()=>setToast(''),4500);return()=>clearTimeout(id);},[toast]);

  const groups=useMemo(()=>catalog?.groups.filter(g=>!g.support)??[],[catalog]);
  const muscle=groups.find(g=>g.id===selected);
  const changed=useMemo(()=>groups.filter(g=>g.sides.some(s=>getSize(values,g.id,s)!==1)),[groups,values]);
  const searchResults=useMemo(()=>groups.filter(g=>`${g.name} ${g.anatomicalName} ${regions.find(r=>r.id===g.region)?.name}`.toLowerCase().includes(query.toLowerCase().trim())),[groups,query]);
  const details=muscle?muscleDetails(muscle):null;
  const state=useMemo(()=>({selected,values,mode,xray,isolate,compare,side,navigation}),[selected,values,mode,xray,isolate,compare,side,navigation]);
  const selectMuscle=useCallback((id:string)=>{
    const g=groups.find(m=>m.id===id);if(!g)return;
    setSelected(id);setRegion(g.region);setSide('both');
  },[groups]);
  const explorePrompt=(id:string,angle:'front'|'back'|'left')=>{selectMuscle(id);setQuery('');setTab('explore');setIsolate(false);setXray(false);setView(angle);viewerRef.current?.view(angle);};
  const value=muscle ? (side==='both'?muscle.sides.reduce((sum,s)=>sum+getSize(values,muscle.id,s),0)/muscle.sides.length:getSize(values,muscle.id,side)) : 1;
  const asymmetric=muscle&&muscle.sides.length>1&&new Set(muscle.sides.map(s=>getSize(values,muscle.id,s))).size>1;

  const commit=(next:Values)=>{
    if(JSON.stringify(next)===JSON.stringify(values))return;
    setHistory(h=>[...h.slice(-29),values]);setValues(next);
  };
  const startGesture=()=>{if(gesture.current===null)gesture.current=latestValues.current;};
  const endGesture=()=>{
    if(gesture.current&&JSON.stringify(gesture.current)!==JSON.stringify(latestValues.current)){
      const before=gesture.current;setHistory(h=>[...h.slice(-29),before]);
    }
    gesture.current=null;
  };
  const updateSlider=(size:number)=>{if(muscle){startGesture();const next=setSize(latestValues.current,muscle,side,size);latestValues.current=next;setValues(next);}};
  const undo=()=>{if(history.length){setValues(history[history.length-1]);setHistory(h=>h.slice(0,-1));setToast('Last adjustment undone.');}};
  const reset=()=>{if(changed.length){commit({});setToast('All muscles returned to the reference size. Undo is available.');}};
  const exportShape=()=>{
    const blob=new Blob([JSON.stringify(serializeShape(values),null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='learn-your-physique-shape.json';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setToast('Shape exported. You can import it here later.');
  };
  const importShape=async(file:File)=>{
    try{if(file.size>500000)throw new Error('This shape file is too large to open.');const result=validateShape(JSON.parse(await file.text()),groups);commit(result);setToast('Your shape is restored.');}
    catch(error){setToast(error instanceof Error?error.message:'Could not open that shape.');}
  };
  const changeMode=(next:ViewMode)=>{setMode(next);if(next==='skin'){setIsolate(false);setXray(false);}};
  const focus=()=>viewerRef.current?.focus();

  function muscleRow(g:MuscleGroup){
    const isChanged=g.sides.some(s=>getSize(values,g.id,s)!==1);
    return <button key={g.id} className={`muscle-row ${g.id===selected?'selected':''}`} onClick={()=>selectMuscle(g.id)} aria-pressed={g.id===selected}>
      <span className={`muscle-dot ${isChanged?'changed':''}`}/><span>{g.name}</span>{isChanged?<span className="adjusted-mark" aria-label="Adjusted">●</span>:g.id===selected?<ChevronRight size={14}/>:null}
    </button>;
  }

  if(loadError)return <main className="startup"><CircleHelp size={32}/><h1>The muscle library couldn’t load.</h1><p>Check your connection, then reload the page.</p><button className="primary-button" onClick={()=>window.location.reload()}>Reload</button></main>;
  if(!catalog||!muscle||!details)return <main className="startup"><Layers2 size={30}/><h1>Learn Your Physique</h1><LoaderCircle className="spin"/><p>Opening your physique explorer…</p></main>;

  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="Learn Your Physique home"><span className="brand-symbol"><Layers2 size={23} strokeWidth={1.6}/></span><span className="brand-name"><small>LEARN YOUR</small>PHYSIQUE<span className="brand-dot">.</span></span></a>
      <span className="header-divider"/><span className="brand-description">Anatomy for the way you train.</span>
      <nav className="main-nav" aria-label="Workspace">
        <button className={tab==='explore'?'active':''} onClick={()=>setTab('explore')}>Explore</button>
        <button className={tab==='changes'?'active':''} onClick={()=>setTab('changes')}>My changes <span className="nav-count">{changed.length}</span></button>
      </nav>
      <div className="header-actions"><button className="about-button" onClick={()=>aboutRef.current?.showModal()}><CircleHelp size={16}/><span>About the model</span></button><button className="primary-button save-button" onClick={exportShape}><ArrowDownToLine size={16}/><span>Save shape</span></button></div>
    </header>

    <div className="page-intro"><div><div className="eyebrow"><span className="live-dot"/> CONNECT TRAINING TO SHAPE</div><h1>Understand what <em>you train.</em></h1><p>Discover which muscles shape your physique. Explore their size, function, and contribution in 3D.</p></div><div className="reference-tag"><PersonStanding size={19}/><div><strong>Explore a reference body</strong><span>Adult male · illustrative proportions</span></div></div></div>

    <div className="explore-prompts" aria-label="Explore a physique feature"><span>Start with a question</span>{[
      {label:'Shoulder width',id:INITIAL_SELECTION,angle:'front' as const},
      {label:'Back taper',id:'latissimus-dorsi',angle:'back' as const},
      {label:'Arm fullness',id:'long-head-of-triceps-brachii',angle:'left' as const},
      {label:'Glute shape',id:'gluteus-maximus',angle:'left' as const},
    ].map(p=><button key={p.id} onClick={()=>explorePrompt(p.id,p.angle)} aria-pressed={selected===p.id}>{p.label}<ArrowUpRight size={12}/></button>)}</div>

    <main className="workspace">
      <div className="mobile-muscle-picker"><label htmlFor="mobile-muscle">Explore a muscle</label><select id="mobile-muscle" value={selected} onChange={e=>selectMuscle(e.target.value)}>{regions.map(r=><optgroup label={r.name} key={r.id}>{groups.filter(g=>g.region===r.id).map(g=><option value={g.id} key={g.id}>{g.name}</option>)}</optgroup>)}</select></div>
      <aside className="library" aria-label="Muscle library">
        <div className="library-heading"><div><h2>{tab==='explore'?'Muscle library':'Your adjustments'}</h2><p>{tab==='explore'?`${catalog.muscleControls} muscle groups & parts`:`${changed.length} muscle controls adjusted`}</p></div><SlidersHorizontal size={17}/></div>
        {tab==='explore'?<>
          <div className="search-field"><Search size={16}/><input ref={searchRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a muscle…" aria-label="Search muscles"/>{query&&<button aria-label="Clear search" onClick={()=>{setQuery('');searchRef.current?.focus();}}><X size={14}/></button>}</div>
          <div className="library-scroll">
            {query.trim()?<><div className="list-label">{searchResults.length} RESULTS</div>{searchResults.map(muscleRow)}{searchResults.length===0&&<div className="empty-state"><Search size={25}/><strong>No matching muscles</strong><p>Try a region or an anatomical name. Some structures are absent from this dataset.</p><button className="text-button" onClick={()=>aboutRef.current?.showModal()}>View model coverage <ArrowUpRight size={13}/></button></div>}</>:regions.map(r=>{
              const members=groups.filter(g=>g.region===r.id);
              return <section className={`region ${region===r.id?'expanded':''}`} key={r.id}>
                <button className="region-button" onClick={()=>setRegion(region===r.id?'':r.id)} aria-expanded={region===r.id}><span className="region-icon"><PersonStanding size={17} strokeWidth={1.4}/></span><span>{r.name}</span><span className="region-count">{members.length}</span><ChevronDown size={13}/></button>
                {region===r.id&&<div className="region-muscles">{members.map(muscleRow)}</div>}
              </section>;
            })}
          </div>
        </>:<div className="library-scroll changes-list">
          {changed.length?changed.map(g=><div className="change-entry" key={g.id}>{muscleRow(g)}<div className="change-values">{g.sides.map(s=><span key={s}>{s==='center'?'Midline':s==='left'?'L':'R'} <strong>{formatSize(getSize(values,g.id,s))}</strong></span>)}<button aria-label={`Reset ${g.name}`} onClick={()=>commit(setSize(values,g,'both',1))}><RotateCcw size={13}/></button></div></div>):<div className="empty-state"><SlidersHorizontal size={28}/><strong>A fresh starting point</strong><p>Adjust any muscle to begin exploring your shape.</p><button className="text-button" onClick={()=>setTab('explore')}>Explore the muscles <ArrowUpRight size={13}/></button></div>}
          {changed.length>0&&<button className="secondary-button compare-changes" onClick={()=>setCompare(!compare)}><ArrowLeftRight size={15}/>{compare?'Close comparison':'Compare with reference'}</button>}
        </div>}
        <div className="library-footer"><div className="library-stat"><span className="tiny-dot"/>{catalog.muscleMeshes} anatomical muscle pieces</div><button className="text-button" onClick={()=>aboutRef.current?.showModal()}>Anatomy sources & coverage <ArrowUpRight size={12}/></button></div>
      </aside>

      <section className="model-stage" aria-label="Body visualization">
        <div className="stage-top"><div className="mode-tabs" role="group" aria-label="Model layer"><button className={mode==='anatomy'?'active':''} onClick={()=>changeMode('anatomy')} aria-pressed={mode==='anatomy'}><Layers2 size={14}/>Anatomy</button><button className={mode==='skin'?'active':''} onClick={()=>changeMode('skin')} aria-pressed={mode==='skin'}><PersonStanding size={15}/>Physique</button></div><button className={`compare-button ${compare?'active':''}`} onClick={()=>setCompare(!compare)} aria-pressed={compare} title="Compare current shape with the reference"><ArrowLeftRight size={15}/><span>Compare</span></button></div>
        <div className="stage-caption"><span className="eyebrow">{isolate?'ISOLATED MUSCLE':xray?'SEE-THROUGH ANATOMY':mode==='skin'?'SURFACE & SILHOUETTE':'SUPERFICIAL & DEEP ANATOMY'}</span><span>{compare?'Reference + your shape':'Double-click to focus anywhere'}</span><select className="focus-area" aria-label="Focus body area" value="" onChange={e=>{const area=e.target.value;if(area==='whole'){viewerRef.current?.resetCamera();setView('front');}else if(area==='selected')focus();else viewerRef.current?.focusArea(area as FocusArea);}}><option value="" disabled>Jump to an area…</option><option value="head">Head & neck</option><option value="chest">Chest & shoulders</option><option value="core">Core & pelvis</option><option value="legs">Legs & feet</option><option value="selected">Selected muscle</option><option value="whole">Whole body</option></select></div>
        <BodyViewer catalog={catalog} state={state} onSelect={selectMuscle} apiRef={viewerRef}/>
        {compare&&<div className="comparison-labels"><span>Reference <b>1.00×</b></span><span>Your shape <b>{changed.length} adjusted</b></span></div>}
        <div className="stage-tools" aria-label="Camera controls"><button className={`navigation-tool ${navigation==='rotate'?'active':''}`} title="Drag to rotate" aria-label="Rotate model" aria-pressed={navigation==='rotate'} onClick={()=>setNavigation('rotate')}><Rotate3D size={18}/><small>Rotate</small></button><button className={`navigation-tool ${navigation==='pan'?'active':''}`} title="Drag to move the model up, down or sideways" aria-label="Move model" aria-pressed={navigation==='pan'} onClick={()=>setNavigation('pan')}><Hand size={18}/><small>Move</small></button><span/><button title="Focus on selected muscle" aria-label="Focus on selected muscle" onClick={focus}><Focus size={18}/></button><button title="Zoom in" aria-label="Zoom in" onClick={()=>viewerRef.current?.zoom(.82)}><Plus size={18}/></button><button title="Zoom out" aria-label="Zoom out" onClick={()=>viewerRef.current?.zoom(1.22)}><Minus size={18}/></button><span/><button title="Fit whole body" aria-label="Fit whole body" onClick={()=>{viewerRef.current?.resetCamera();setView('front');}}><Maximize size={17}/></button></div>
        <div className="stage-bottom"><div className="view-tabs" role="group" aria-label="Camera view">{(['front','back','left','right'] as const).map(v=><button key={v} className={view===v?'active':''} aria-pressed={view===v} onClick={()=>{setView(v);viewerRef.current?.view(v);}}>{v[0].toUpperCase()+v.slice(1)}</button>)}</div><div className="orbit-hint"><Move size={13}/><span>{navigation==='pan'?'Drag to move':'Drag to rotate · Shift-drag to move'} <i>·</i> Scroll toward pointer</span></div><span className="touch-hint">One finger to {navigation==='pan'?'move':'rotate'} · Two fingers to move & pinch</span></div>
        <div className="stage-corner">3D / {mode==='skin'?'SURFACE':'MUSCLE'} STUDY</div>
      </section>

      <aside className="inspector" aria-label="Muscle controls">
        <div className="inspector-scroll">
          <div className="section-kicker"><span>01</span> SELECTED MUSCLE <span className="selection-indicator"/></div>
          <div className="muscle-heading"><h2>{muscle.name}</h2><p>{muscle.anatomicalName}</p><div className="muscle-tags"><span>{regions.find(r=>r.id===muscle.region)?.name}</span><span>{muscle.superficial?'Surface contour':'Deeper / local structure'}</span></div></div>
          <div className="effect-block"><div className="mini-heading">HOW IT SHAPES YOUR PHYSIQUE</div><p>{details.effect}</p></div>
          <div className="size-control">
            <div className="section-kicker"><span>02</span> EXPLORE MUSCLE SIZE</div>
            <div className="size-label"><label htmlFor="muscle-size">Size vs. reference</label><output htmlFor="muscle-size" aria-live="polite">{formatSize(value)}</output></div>
            <input id="muscle-size" className="growth-slider" type="range" min="0" max="100" step="0.1" value={sizeToSlider(value)} aria-label={`${muscle.name} size compared with reference`} aria-valuemin={MIN_SIZE} aria-valuemax={MAX_SIZE} aria-valuenow={value} aria-valuetext={`${formatSize(value)} the reference model volume`} style={{'--slider-progress':`${sizeToSlider(value)}%`} as React.CSSProperties} onPointerDown={startGesture} onPointerUp={endGesture} onPointerCancel={endGesture} onBlur={endGesture} onKeyDown={startGesture} onKeyUp={endGesture} onChange={e=>updateSlider(sliderToSize(Number(e.target.value)))}/>
            <div className="slider-labels"><span>{formatSize(MIN_SIZE)}</span><span className="reference-tick" style={{left:`${sizeToSlider(1)}%`}}>1.00× reference</span><span>{formatSize(MAX_SIZE)}</span></div>
            <div className="size-presets" role="group" aria-label="Size presets">{[1,1.5,3,6].map(n=><button key={n} className={Math.abs(value-n)<.001?'active':''} onClick={()=>commit(setSize(values,muscle,side,n))}>{n===1?'Reference':formatSize(n)}</button>)}</div>
            <ExactSize key={`${muscle.id}:${side}`} value={value} onCommit={n=>commit(setSize(values,muscle,side,n))}/>
            {muscle.sides.length>1?<div className="side-control"><span><Link2 size={14}/>{side==='both'?'Both sides linked':'Independent sides'}</span><div role="group" aria-label="Side to adjust">{(['both','left','right'] as const).filter(s=>s==='both'||muscle.sides.includes(s)).map(s=><button key={s} className={side===s?'active':''} aria-pressed={side===s} onClick={()=>setSide(s)}>{s==='both'?'Both':s==='left'?'L':'R'}</button>)}</div></div>:<div className="side-control"><span>Midline structure</span></div>}
            {asymmetric&&side==='both'&&<p className="subtle-note">The sides differ. The slider shows their average; moving it sets both to the same size.</p>}
            <p className="simulation-note"><Sparkles size={13}/><span>Illustrative muscle volume. 1× = the reference body.</span></p>
          </div>
          <div className="inspection-controls"><div className="mini-heading">TAKE A CLOSER LOOK</div><div className="inspection-buttons"><button className={xray?'active':''} aria-pressed={xray} onClick={()=>{setMode('anatomy');setXray(!xray);}}><Layers2 size={15}/>See through</button><button className={isolate?'active':''} aria-pressed={isolate} onClick={()=>{setMode('anatomy');setIsolate(!isolate);if(!isolate)window.setTimeout(focus,0);}}><Focus size={15}/>Isolate</button></div></div>
          <div className="movement-block"><div className="mini-heading">{details.minor?'REGION CONTEXT':'WHAT IT DOES'}</div><p>{details.action}</p>{details.examples.length>0&&<><div className="mini-heading movement-examples-title">MOVEMENTS THAT INVOLVE IT</div><div className="exercise-tags">{details.examples.map(e=><span key={e}>{e}</span>)}</div><p className="subtle-note">These movements involve several muscles; individual heads are not fully isolated.</p></>}</div>
        </div>
        <div className="inspector-footer"><button disabled={history.length===0} onClick={undo}><Undo2 size={15}/>Undo</button><button disabled={changed.length===0} onClick={reset}><RotateCcw size={14}/>Reset all</button><span title={storageAvailable?'Saved in this browser':'Browser storage unavailable'}>{storageAvailable?<Check size={13}/>:<CircleHelp size={13}/>}<span>{storageAvailable?'Auto-saved':'Export to save'}</span></span></div>
      </aside>
    </main>

    <section className="learning-guide" aria-label="How to learn with the explorer">
      <div className="guide-intro"><span className="eyebrow">A LITTLE ANATOMY. MORE INTENTION.</span><h2>Make sense of<br/><em>the work you put in.</em></h2><p>A workout names the exercise. This explorer helps you understand the muscles behind it.</p><button className="text-button" onClick={()=>aboutRef.current?.showModal()}>Why we built this <ArrowUpRight size={13}/></button></div>
      <div><span className="guide-number">01 / LOCATE</span><h3>Find what you’re training.</h3><p>Explore a region, search a name, or select a muscle. See where it sits and what movement it supports.</p></div>
      <div><span className="guide-number">02 / EXPLORE</span><h3>Connect size to silhouette.</h3><p>Adjust one muscle and compare from the front, back and side. Different muscles contribute width, depth or local contour.</p></div>
      <div><span className="guide-number">03 / PUT IT IN CONTEXT</span><h3>Look beyond the outline.</h3><p>Deep muscles matter for movement and stability. Your real results also depend on your frame, body composition and training history.</p><span className="guide-limit">A visual learning tool, not a personal growth prediction.</span></div>
    </section>

    <footer className="page-footer"><p><span className="tiny-dot"/>Explore the shape. Understand the muscle. Bring that context to your training.</p><div><button onClick={()=>uploadRef.current?.click()}><Upload size={13}/>Import shape</button><a href="https://github.com/atharva-create/learn-your-physique" target="_blank" rel="noreferrer">View on GitHub <ArrowUpRight size={12}/></a></div><input type="file" accept="application/json,.json" ref={uploadRef} className="hidden" aria-label="Import a saved shape" onChange={e=>{const f=e.target.files?.[0];if(f)void importShape(f);e.target.value='';}}/></footer>
    {toast&&<div className="toast" role="status"><Check size={16}/>{toast}<button onClick={()=>setToast('')} aria-label="Dismiss notification"><X size={14}/></button></div>}

    <dialog ref={aboutRef} className="about-dialog" onClick={e=>{if(e.target===aboutRef.current)aboutRef.current?.close();}}>
      <div className="dialog-heading"><span className="eyebrow">WHY WE BUILT THIS</span><button aria-label="Close model information" onClick={()=>aboutRef.current?.close()}><X size={20}/></button></div>
      <h2>Know the muscle.<br/><em>Understand the bigger picture.</em></h2>
      <p>Training advice often tells you what to do without showing you what each muscle contributes to your physique. Learn Your Physique connects the names in your workout to the shape and function of the muscles underneath. It started as a weekend project built with Astra, around a simple question: what changes when this muscle develops?</p>
      <section><h3>From exercise names to understanding</h3><p>Outer shoulders contribute to upper-body width. Lats influence the taper of the back. Triceps add fullness behind the arm. Quads, hamstrings and glutes shape different parts of the lower body. Seeing where they sit makes these relationships easier to understand.</p><p>Choose a muscle, read its contribution, then move the slider and compare angles. Switch to Physique to explore the outer silhouette. Use this as context for your training decisions: a muscle’s importance also includes movement and stability, even when it barely changes your outline.</p></section><section><h3>What is included</h3><p>{catalog.muscleMeshes} muscle meshes, organized into {catalog.muscleControls} controls with separate left and right settings, plus 201 bone meshes and a skin layer. The library includes large muscles, individual heads, deep muscles, and small structures in the face, eyes, throat, hands and feet.</p><p>This is <strong>not a complete inventory of every human muscle</strong>. Some segmental muscles are grouped, some anatomical variants and small structures are absent, and some models combine parts. Counts refer to mesh pieces and controls, not a count of all muscles in your body. Smooth and cardiac muscle are outside the physique simulator.</p></section>
      <section><h3>What the slider means</h3><p>1.00× is the reference mesh. The slider scales a muscle across its two shorter dimensions while preserving its principal length. The multiplier describes geometric volume, not training volume, effort, strength or a promised amount of growth. The {formatSize(MIN_SIZE)}–{formatSize(MAX_SIZE)} range lets you explore subtle through exaggerated proportions. Logarithmic spacing keeps smaller adjustments precise; you can also type an exact multiplier.</p><p>The skin view approximates nearby surface movement. It does not simulate fascia, physical contact between muscles, changes in fat, skeletal proportions, tendon attachments, or posture. Enlarged meshes may overlap. Deep structures often have little visible effect on the outer body. Tiny eye, face and throat structures are provided for anatomy study, not as suggested hypertrophy targets.</p></section>
      <section><h3>Why it isn’t a personal forecast</h3><p>The reference is an adult male anatomy model. It has not been fitted to your body, measurements or body composition. A real physique also reflects genetics, bone structure, fat distribution, nutrition, training history and time. Research documents substantial variation in size changes after resistance training.</p><a href="https://pubmed.ncbi.nlm.nih.gov/15947721/" target="_blank" rel="noreferrer">Read the resistance-training response study <ArrowUpRight size={13}/></a></section>
      <section><h3>Anatomy & attribution</h3><p><a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html" target="_blank" rel="noreferrer">BodyParts3D</a>, © The Database Center for Life Science. The current archive is licensed under CC Attribution 4.0 International. The muscle and skeleton files retain their distributed CC BY-SA 2.1 Japan attribution.</p><p><a href="https://www.z-anatomy.com/" target="_blank" rel="noreferrer">Z-Anatomy</a> by Gauthier Kervyn, CC BY-SA 4.0. GLB preparation and supplementary mesh alignment by <a href="https://github.com/JohanBellander/BodyExplorer" target="_blank" rel="noreferrer">Johan Bellander / BodyExplorer</a>. Learn Your Physique adds its own interface, size transformations and approximate surface deformation.</p><p>Anatomical movement context: <a href="https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs" target="_blank" rel="noreferrer">OpenStax, Anatomy and Physiology 2e, chapter 11</a>. Movement examples indicate common exercise patterns, not precise muscle isolation.</p><a href={`${import.meta.env.BASE_URL}anatomy/ATTRIBUTION.md`} target="_blank" rel="noreferrer">Full asset licenses & source details <ArrowUpRight size={13}/></a></section>
      <section><h3>Your shape stays here</h3><p>Adjustments are saved in this browser. “Save shape” exports them as a small JSON file you can import later. No account, body measurements or photographs are requested. Shape adjustments stay on your device. The site loads anatomy assets and Google Fonts over the network; no analytics or tracking scripts are added by the app.</p></section>
      <button className="primary-button dialog-done" onClick={()=>aboutRef.current?.close()}>Back to exploring <ArrowUpRight size={15}/></button>
    </dialog>
  </div>;
}

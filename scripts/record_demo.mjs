/** Record the real explorer in a fresh Chromium context, with an edit list for captions. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseURL=process.env.DEMO_URL || 'http://localhost:4173/learn-your-physique/';
const dir=path.resolve('launch/raw');
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true, ...(process.env.DEMO_CHROME ? {channel:'chrome'} : {}), args:process.env.DEMO_CHROME ? [] : ['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1080},deviceScaleFactor:1,recordVideo:{dir,size:{width:1440,height:1080}}});
const page=await context.newPage();
page.setDefaultTimeout(90000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const start=Date.now();
const scenes=[];
const pause=ms=>page.waitForTimeout(ms);
const stamp=()=>((Date.now()-start)/1000);
async function scene(title,detail,action,hold=2200){
  const from=stamp();
  console.log('Scene:',title);
  await action();await pause(hold);
  scenes.push({from,to:stamp(),title,detail});
}
try{
  await page.goto(baseURL);
  await page.locator('canvas').waitFor({state:'visible'});
  await page.locator('.viewer-status').waitFor({state:'hidden'});
  await page.evaluate(()=>document.fonts.ready);
  await pause(1200);
  // Leave space below the app for captions added in the edit, without obscuring controls.
  await page.addStyleTag({content:'.workspace{height:690px;min-height:690px}.learning-guide,.page-footer{visibility:hidden}'});
  await page.mouse.move(18,20);
  await page.screenshot({path:'docs/assets/explorer.png'});
  await page.evaluate(()=>{const cursor=document.createElement('div');cursor.style.cssText='position:fixed;width:18px;height:18px;border:2px solid #275d49;background:#e4eddb77;border-radius:50%;pointer-events:none;z-index:9999;left:-30px;top:-30px';document.body.append(cursor);document.addEventListener('mousemove',e=>{cursor.style.left=(e.clientX-9)+'px';cursor.style.top=(e.clientY-9)+'px';});});
  await scene('Understand what you train.','A weekend project built with Astra.',async()=>{},2200);
  await scene('Start with shoulder width.','See the muscle behind the movement.',async()=>{
    await page.getByRole('button',{name:'Shoulder width',exact:true}).click();
    await page.getByRole('combobox',{name:'Focus body area'}).selectOption('chest');
  });
  await scene('Change the size. Explore the shape.','Illustrative muscle volume — not a prediction of training results.',async()=>{
    const slider=page.getByRole('slider');const rect=await slider.boundingBox();
    const y=rect.y+rect.height/2;
    await page.mouse.move(rect.x+rect.width*.376,y);await page.mouse.down();
    for(let i=1;i<=24;i++){await page.mouse.move(rect.x+rect.width*(.376+.20*i/24),y);await pause(40);}
    await page.mouse.up();
    const input=page.getByRole('spinbutton',{name:'Exact multiplier'});
    await input.fill('2');await input.press('Enter');await page.mouse.move(18,20);
  });
  await scene('Connect anatomy to silhouette.','Switch to the outer body view.',async()=>{
    await page.getByRole('button',{name:'Physique',exact:true}).click();
  });
  await scene('Keep the starting point in view.','Compare your exploration with the reference.',async()=>{
    await page.getByRole('button',{name:'Compare',exact:true}).click();
    await page.getByRole('combobox',{name:'Focus body area'}).selectOption('chest');
  },3000);
  await scene('Different muscles. Different contributions.','Lats influence the taper of the back.',async()=>{
    await page.getByRole('button',{name:'Compare',exact:true}).click();
    await page.getByRole('button',{name:'Anatomy',exact:true}).click();
    await page.getByRole('button',{name:'Back taper',exact:true}).click();
    await pause(800);
    await page.getByRole('button',{name:'1.50×',exact:true}).click();
  });
  await scene('Explore from every angle.','Glutes contribute to the rear and side contour.',async()=>{
    await page.getByRole('button',{name:'Glute shape',exact:true}).click();
    await page.getByRole('combobox',{name:'Focus body area'}).selectOption('core');
    await page.getByRole('button',{name:'1.50×',exact:true}).click();
  });
  await scene('236 muscle groups and parts to explore.','Learn the location, function and contribution.',async()=>{
    await page.getByRole('button',{name:'Fit whole body',exact:true}).click();
    await page.getByRole('button',{name:'Shoulder width',exact:true}).click();
    await page.getByRole('button',{name:'Reset all',exact:true}).click();
  });
  await scene('Learn Your Physique','atharva-create.github.io/learn-your-physique',async()=>{},2500);
  await writeFile('launch/raw/edit-list.json',JSON.stringify({scenes,errors,baseURL,viewport:{width:1440,height:1080}},null,2));
  if(errors.length)throw new Error(errors.join('\n'));
}finally{
  const video=page.video();
  await context.close();
  await video.saveAs(path.join(dir,'app-recording.webm'));
  await browser.close();
}
console.log('Recording and edit list saved to launch/raw');

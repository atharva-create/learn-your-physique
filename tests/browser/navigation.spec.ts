import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

function bodyPixels(buffer:Buffer){
  const {width,height,data}=PNG.sync.read(buffer);
  let left=width,right=0,top=height,bottom=0,count=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
    if(r>70&&r>g*1.18&&r>b*1.2){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}
  }
  return {left,right,top,bottom,count,width:right-left,height:bottom-top};
}

test('pointer zoom, vertical pan, regional focus, and double-click operate on the actual rendered body',async({page})=>{
  // Software WebGL is substantially slower than the hardware-accelerated app.
  test.setTimeout(180000);
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await page.goto('./');
  const canvas=page.locator('canvas');
  await expect(canvas).toBeVisible({timeout:60000});
  await expect(page.locator('.viewer-status')).toHaveCount(0,{timeout:60000});
  const rect=(await canvas.boundingBox())!;
  const reference=bodyPixels(await canvas.screenshot());
  expect(reference.count).toBeGreaterThan(5000);

  // Zoom at the head. Its position stays near the pointer instead of flying off
  // the top of the image as it did when all zoom used the chest pivot.
  await page.mouse.move(rect.x+(reference.left+reference.right)/2,rect.y+reference.top+18);
  await page.mouse.wheel(0,-600);await page.waitForTimeout(400);
  const cursorZoom=bodyPixels(await canvas.screenshot());
  expect(cursorZoom.width).toBeGreaterThan(reference.width*1.1);
  expect(cursorZoom.top).toBeGreaterThan(reference.top-25);

  await page.getByRole('button',{name:'Fit whole body'}).click();await page.waitForTimeout(550);
  await page.getByRole('button',{name:'Move model',exact:true}).click();
  await page.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.35);
  await page.mouse.down();await page.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.35+95,{steps:4});await page.mouse.up();
  await page.waitForTimeout(450);
  const moved=bodyPixels(await canvas.screenshot());
  expect(moved.top).toBeGreaterThan(reference.top+45);

  await page.getByRole('button',{name:'Fit whole body'}).click();await page.waitForTimeout(550);
  await page.getByRole('button',{name:'Rotate model',exact:true}).click();
  await page.keyboard.down('Shift');
  await page.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.3);await page.mouse.down();
  await page.mouse.move(rect.x+rect.width*.7,rect.y+rect.height*.3+80,{steps:4});await page.mouse.up();await page.keyboard.up('Shift');
  await page.waitForTimeout(450);
  expect(bodyPixels(await canvas.screenshot()).top).toBeGreaterThan(reference.top+35);

  await page.getByRole('combobox',{name:'Focus body area'}).selectOption('head');await page.waitForTimeout(550);
  const head=bodyPixels(await canvas.screenshot({path:'screenshots/head-focus.png'}));
  expect(head.width).toBeGreaterThan(reference.width*1.8);
  await page.getByRole('button',{name:'Physique',exact:true}).click();
  await canvas.screenshot({path:'screenshots/realistic-face.png'});

  await page.getByRole('button',{name:'Anatomy',exact:true}).click();
  await page.getByRole('button',{name:'Fit whole body'}).click();await page.waitForTimeout(550);
  await page.mouse.dblclick(rect.x+rect.width*.5,rect.y+rect.height*.38);
  await page.waitForTimeout(550);
  expect(bodyPixels(await canvas.screenshot()).width).toBeGreaterThan(reference.width*1.4);
  expect(errors).toEqual([]);
});

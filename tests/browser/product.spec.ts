import {test,expect} from '@playwright/test';
import {PNG} from 'pngjs';

test('physique prompts connect to muscles and regional comparison keeps both bodies visible',async({page})=>{
  await page.goto('./');
  await expect(page.locator('.viewer-status')).toHaveCount(0,{timeout:60000});
  await expect(page.locator('canvas')).toBeVisible({timeout:60000});
  for(const [prompt,muscle] of [['Back taper','Latissimus dorsi'],['Arm fullness','Triceps brachii · long head'],['Glute shape','Gluteus maximus'],['Shoulder width','Lateral deltoid']]){
    await page.getByRole('button',{name:prompt,exact:true}).click();
    await expect(page.getByRole('heading',{name:muscle,exact:true})).toBeVisible();
  }
  await page.getByRole('button',{name:'Physique',exact:true}).click();
  await page.getByRole('button',{name:'Compare',exact:true}).click();
  await page.getByRole('combobox',{name:'Focus body area'}).selectOption('chest');
  await page.waitForTimeout(600);
  const {width,height,data}=PNG.sync.read(await page.locator('canvas').screenshot({path:'screenshots/regional-comparison.png'}));
  let left=0,right=0,center=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
    if(r>90&&r>g*1.1&&r>b*1.2){
      if(x<width*.4)left++;
      if(x>width*.6)right++;
      if(Math.abs(x-width/2)<3)center++;
    }
  }
  expect(left).toBeGreaterThan(3000);expect(right).toBeGreaterThan(3000);
  expect(center).toBeLessThan(height*.2);
});

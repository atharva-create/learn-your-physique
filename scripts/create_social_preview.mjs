import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1080}});
  await page.goto(process.env.DEMO_URL || 'http://localhost:4173/learn-your-physique/');
  await page.locator('canvas').waitFor({timeout:60000});
  await page.locator('.viewer-status').waitFor({state:'hidden',timeout:60000});
  await page.getByRole('combobox',{name:'Focus body area'}).selectOption('chest');
  await page.waitForTimeout(800);
  const picture=await page.locator('canvas').screenshot();
  const card=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  await card.setContent(`<!doctype html><html><style>*{box-sizing:border-box}body{margin:0;background:#f6f6f2;color:#294738;font-family:Arial,sans-serif}.copy{position:absolute;left:60px;top:62px;z-index:2;width:535px}.label{font-size:15px;letter-spacing:3px;font-weight:600;color:#5d7857}h1{font-family:Georgia,serif;font-size:72px;font-weight:400;line-height:1.03;letter-spacing:-3px;margin:43px 0 23px}em{color:#708c64}p{font-size:21px;line-height:1.6;color:#617858;max-width:405px}.pill{display:inline-block;margin-top:15px;padding:12px 18px;border-radius:24px;background:#e4eddc;color:#41603a;font-size:14px}.visual{position:absolute;left:570px;top:0;width:630px;height:630px;overflow:hidden;border-left:1px solid #e0e6d8}.visual img{position:absolute;height:720px;width:1000px;object-fit:cover;left:-202px;top:-40px}.footer{position:absolute;bottom:25px;left:60px;font-size:13px;color:#7d8d73;z-index:2}</style><div class="visual"><img src="data:image/png;base64,${picture.toString('base64')}"></div><div class="copy"><div class="label">LEARN YOUR PHYSIQUE</div><h1>Understand<br>what <em>you train.</em></h1><p>Connect the muscles in your workout to the shape of your body.</p><div class="pill">236 muscle groups & parts · Interactive 3D</div></div><div class="footer">A weekend project built with Astra.</div></html>`);
  await card.locator('img').evaluate(i=>i.decode());
  await card.screenshot({path:'public/social-preview.png'});
}finally{await browser.close()}

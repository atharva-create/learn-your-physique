"""Edit the real browser recording into a captioned, silent social demo.

Requires imageio-ffmpeg (or FFMPEG pointing to an ffmpeg executable).
"""
from pathlib import Path
import json, os, subprocess
import imageio_ffmpeg

root=Path(__file__).resolve().parents[1]
raw=root/'launch/raw'
scenes=json.loads((raw/'edit-list.json').read_text())['scenes']
ffmpeg=os.environ.get('FFMPEG') or imageio_ffmpeg.get_ffmpeg_exe()
fonts=[Path('/System/Library/Fonts/Supplemental/Arial.ttf'),Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')]
font=next(p for p in fonts if p.exists())
durations=[3.2,4.3,5.5,4,5,4.5,4.5,4,3.5]
filters=[]
for i,(s,d) in enumerate(zip(scenes,durations)):
    # The recording retains actual interactions. Long browser waits are shortened.
    duration=s['to']-s['from']
    filters.append(f"[0:v]trim=start={s['from']:.3f}:end={s['to']:.3f},setpts=(PTS-STARTPTS)*{d/duration:.8f},fps=30,setsar=1[v{i}]")
filters.append(''.join(f'[v{i}]' for i in range(len(scenes)))+f'concat=n={len(scenes)}:v=1:a=0[joined]')
chain='[joined]drawbox=x=0:y=988:w=1440:h=92:color=0x244c3b:t=fill'
srt=[]
cursor=0
def timestamp(n):
    ms=round(n*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
for i,(s,d) in enumerate(zip(scenes,durations)):
    for kind,y,size,color in [('title',1002,26,'0xf6faed'),('detail',1040,17,'0xd8e5cc')]:
        file=raw/f'{i}-{kind}.txt';file.write_text(s[kind])
        chain+=f",drawtext=fontfile='{font}':textfile='{file}':fontsize={size}:fontcolor={color}:x=(w-text_w)/2:y={y}:enable='gte(t,{cursor:.3f})*lt(t,{cursor+d:.3f})'"
    srt.append(f'{i+1}\n{timestamp(cursor)} --> {timestamp(cursor+d)}\n{s["title"]}\n{s["detail"]}\n')
    cursor+=d
filters.append(chain+'[out]')
filter_file=raw/'video-filter.txt';filter_file.write_text(';\n'.join(filters))
output=root/'launch/learn-your-physique-demo.mp4'
subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','warning','-i',str(raw/'app-recording.webm'),'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-filter_complex_script',str(filter_file),'-map','[out]','-map','1:a','-t',str(cursor),'-c:v','libx264','-preset','medium','-crf','19','-profile:v','high','-level','4.2','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','64k','-movflags','+faststart',str(output)],check=True)
(root/'launch/demo-captions.srt').write_text('\n'.join(srt))
subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-ss','6','-i',str(output),'-frames:v','1',str(root/'launch/demo-poster.jpg')],check=True)
print(f'Created {output.name}: {cursor:.1f}s, {output.stat().st_size/1e6:.1f} MB, 1440×1080, 30 fps, H.264/AAC')

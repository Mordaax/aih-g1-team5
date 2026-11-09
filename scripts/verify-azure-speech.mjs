import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { speechLanguages } from '../lib/speech-languages.ts';

const samples={
  English:'Hello. I am here to help you. You can choose a voice and a comfortable reading speed.',
  Tagalog:'Kumusta. Nandito ako para tumulong sa iyo.',
  'Bahasa Indonesia':'Halo. Saya di sini untuk membantu Anda.',
  Burmese:'မင်္ဂလာပါ။ သင့်ကို ကူညီဖို့ ဒီမှာရှိပါတယ်။',
  Tamil:'வணக்கம். உங்களுக்கு உதவ நான் இங்கே இருக்கிறேன்.',
  Bengali:'নমস্কার। আমি আপনাকে সাহায্য করতে এখানে আছি।',
  Sinhala:'ආයුබෝවන්. ඔබට උදව් කිරීමට මම මෙහි සිටිමි.',
  Hindi:'नमस्ते। मैं आपकी मदद करने के लिए यहाँ हूँ।',
  Khmer:'សួស្តី។ ខ្ញុំនៅទីនេះដើម្បីជួយអ្នក។',
  Thai:'สวัสดีค่ะ ฉันพร้อมช่วยเหลือคุณ คุณสามารถเลือกเสียงและความเร็วในการอ่านที่เหมาะกับคุณได้',
  Malay:'Helo. Saya di sini untuk membantu anda.',
  'Mandarin Chinese':'您好，我在这里为您提供帮助。您可以选择喜欢的声音和合适的朗读速度。',
};
const output=path.join(tmpdir(),'mdw-compass-azure-speech-verification');
await fs.mkdir(output,{recursive:true});
const full=process.argv.includes('--all');
const configs=full?speechLanguages:speechLanguages.filter(item=>item.language==='Thai');
const results=[];
let windowStarted=Date.now(),count=0;
for(const config of configs){
  for(const voice of full?config.voices:config.voices.slice(0,1)){
    if(count>=16){
      const delay=Math.max(0,61_000-(Date.now()-windowStarted));
      if(delay){console.log(JSON.stringify({status:'waiting-for-free-tier-window',seconds:Math.ceil(delay/1000)}));await new Promise(resolve=>setTimeout(resolve,delay));}
      windowStarted=Date.now();count=0;
    }
    const started=Date.now();
    const response=await fetch('http://127.0.0.1:3000/api/speech',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:samples[config.language],language:config.language,voice:voice.id,rate:0.9}),
      signal:AbortSignal.timeout(45_000),
    });
    count++;
    if(!response.ok){
      const error=await response.json().catch(()=>({error:'Invalid error response'}));
      console.log(JSON.stringify({language:config.language,voice:voice.id,status:response.status,error:error.error}));
      process.exitCode=1;
      await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));
      process.exit(1);
    }
    const bytes=Buffer.from(await response.arrayBuffer());
    const mp3=bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224);
    if(!response.headers.get('Content-Type')?.startsWith('audio/')||!mp3||bytes.length<500)throw new Error('Invalid MP3 returned for '+voice.id);
    await fs.writeFile(path.join(output,voice.id+'.mp3'),bytes);
    const result={language:config.language,voice:voice.id,status:response.status,bytes:bytes.length,milliseconds:Date.now()-started};
    results.push(result);console.log(JSON.stringify(result));
  }
}
await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({status:'passed',voices:results.length,output}));

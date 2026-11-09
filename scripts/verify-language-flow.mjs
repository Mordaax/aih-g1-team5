import nextEnv from '@next/env';
import { createTranslator } from '../lib/sealion.ts';
nextEnv.loadEnvConfig(process.cwd());
const translate=createTranslator();
const samples=[
  {language:'Thai',text:'ฉันได้รับเงินเดือน $600 และต้องการวันหยุด'},
  {language:'Mandarin Chinese',text:'我的月薪是 $600。我想了解休息日。'},
];
for(const sample of samples){
  const english=await translate({text:sample.text,sourceLanguage:sample.language,targetLanguage:'English'});
  const translated=await translate({text:'Your salary is $600. You can ask about your rest day.',sourceLanguage:'English',targetLanguage:sample.language});
  console.log(JSON.stringify({language:sample.language,original:sample.text,english,translated}));
}
if(process.argv.includes('--chat')){
  const sessionId=`verify-${crypto.randomUUID()}`;
  for(const input of [
    {message:'Thai',selectLanguage:true},
    {message:'สวัสดี ฉันอยากรู้ว่าคุณช่วยเรื่องอะไรได้บ้าง'},
  ]){
    const response=await fetch('http://127.0.0.1:3000/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,language:'Thai',sessionId,requestId:crypto.randomUUID()}),signal:AbortSignal.timeout(120000)});
    console.log('Website chat',response.status,await response.json());
    if(!response.ok)process.exitCode=1;
  }
}

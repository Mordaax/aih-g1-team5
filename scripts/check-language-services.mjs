import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const key=process.env.SEALION_API_KEY || process.env.SEALION_FALLBACK_API_KEY;
console.log('SEA-LION key:',key?'configured':'missing');
console.log('Azure key:',process.env.AZURE_SPEECH_KEY?'configured':'missing');
console.log('Azure region:',process.env.AZURE_SPEECH_REGION?'configured':'missing');
if(key){
  try{
    const response=await fetch('https://api.sea-lion.ai/v1/models',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
    console.log('SEA-LION model catalog HTTP:',response.status);
    if(response.ok){const data=await response.json();console.log('Available SEA-LION models:',(data.data || []).map(m=>m.id).filter(id=>/sea-lion/i.test(id)));}
  }catch(error){console.log('SEA-LION connection:',error.name);process.exitCode=1;}
}

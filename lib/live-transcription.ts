import { updateTranscript, type StreamingTranscript } from './streaming-transcript';

export type LiveTranscription = { stop: () => Promise<string>; cancel: () => void };

/** MERaLiON's documented optional-key stream. No private API key enters the browser. */
export async function startLiveTranscription(stream: MediaStream, onText: (text: string) => void, onFailure: () => void): Promise<LiveTranscription> {
  const context = new AudioContext({sampleRate:16000});
  let socket: WebSocket | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let node: AudioWorkletNode | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending: ArrayBuffer[] = [];
  let pendingBytes = 0;
  let settled = false;
  let stopping = false;
  let state: StreamingTranscript = {final:'',interim:''};
  let resolveResult!: (text: string) => void;
  let rejectResult!: (error: Error) => void;
  const result = new Promise<string>((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;});
  void result.catch(()=>{});
  const releaseAudio = () => {
    if(node){node.port.onmessage=null;node.disconnect();}
    source?.disconnect();
    void context.close().catch(()=>{});
  };
  const finish = (error?: Error) => {
    if(settled)return;
    settled=true;clearTimeout(timer);releaseAudio();
    if(socket){socket.onclose=null;socket.onerror=null;socket.onmessage=null;socket.close();}
    if(error){rejectResult(error);onFailure();}else resolveResult(state.final || state.interim);
  };
  try {
    if(context.sampleRate!==16000)throw new Error('16 kHz audio unavailable');
    await context.resume();
    await context.audioWorklet.addModule('/audio/pcm-capture.js');
    node=new AudioWorkletNode(context,'pcm-capture',{channelCount:1,channelCountMode:'explicit'});
    source=context.createMediaStreamSource(stream);
    socket=new WebSocket('wss://api.meralion.ai/v1/audio/stream');
    node.port.onmessage=({data})=>{
      if(settled || !socket)return;
      if(socket.bufferedAmount>512*1024){finish(new Error('Streaming connection is too slow'));return;}
      if(data.type==='pcm') {
        if(socket.readyState===WebSocket.OPEN) socket.send(data.pcm);
        else { pending.push(data.pcm); pendingBytes += data.pcm.byteLength; if(pendingBytes > 320000) socket.close(); }
      }
      if(data.type==='flushed'){releaseAudio();socket.send(JSON.stringify({instruction:'eof'}));}
    };
    source.connect(node);node.connect(context.destination);
    await new Promise<void>((resolve,reject)=>{
      timer=setTimeout(()=>reject(new Error('Streaming connection timed out')),10000);
      socket!.onopen=()=>{clearTimeout(timer);resolve();};
      socket!.onerror=()=>reject(new Error('Streaming connection failed'));
      socket!.onclose=()=>reject(new Error('Streaming connection closed'));
    });
    socket.onmessage=(event)=>{
      if(settled || typeof event.data!=='string')return;
      try {
        const message=JSON.parse(event.data);
        if(!message || typeof message!=='object' || message.type==='error')throw new Error('Streaming failed');
        if(message.type==='done'){finish(stopping ? undefined : new Error('Streaming ended early'));return;}
        state=updateTranscript(state,message);
        onText([state.final,state.interim].filter(Boolean).join(' ').slice(0,4000));
      }catch{finish(new Error('Streaming transcription failed'));}
    };
    socket.onerror=()=>finish(new Error('Streaming connection failed'));
    socket.onclose=()=>finish(new Error('Streaming closed before final results'));
    node.onprocessorerror=()=>finish(new Error('Microphone processing failed'));
    if(settled) throw new Error("Streaming failed during setup");
    for (const frame of pending) socket.send(frame);
    pending.length = 0;
    return {
      stop:()=>{
        if(!stopping && !settled){stopping=true;node!.port.postMessage('flush');timer=setTimeout(()=>finish(new Error('Final streaming results timed out')),20000);}
        return result.then(text=>text.slice(0,4000));
      },
      cancel:()=>{onFailure=()=>{};finish(new Error('Recording cancelled'));},
    };
  }catch(error){onFailure=()=>{};finish(error instanceof Error ? error : new Error('Streaming unavailable'));throw error;}
}

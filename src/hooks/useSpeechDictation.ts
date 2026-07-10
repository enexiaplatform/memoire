import { useCallback, useEffect, useRef, useState } from 'react';
import { trackProductEvent } from '../utils/productAnalytics';

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as Record<string, unknown>).SpeechRecognition
    || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  return typeof candidate === 'function' ? candidate as SpeechRecognitionConstructor : null;
}

export type SpeechDictationState = {
  supported: boolean;
  listening: boolean;
  error: string;
  start: () => void;
  stop: () => void;
};

/**
 * Browser-local dictation for capture inputs. Audio never leaves the
 * browser's own speech service; nothing is sent to Memoire servers.
 * Final transcript chunks are delivered through onTranscript.
 */
export function useSpeechDictation(onTranscript: (chunk: string) => void, lang?: string): SpeechDictationState {
  const [supported] = useState(() => getSpeechRecognition() !== null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition || recognitionRef.current) return;
    setError('');

    const recognition = new Recognition();
    recognition.lang = lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal) {
          const transcript = result[0]?.transcript?.trim();
          if (transcript) onTranscriptRef.current(transcript);
        }
      }
    };
    recognition.onerror = (event) => {
      setError(event.error === 'not-allowed'
        ? 'Microphone access was blocked. Allow it in your browser to dictate.'
        : 'Dictation stopped unexpectedly. You can keep typing or try again.');
      recognitionRef.current = null;
      setListening(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
      trackProductEvent('voice_dictation_used');
    } catch {
      setError('Dictation could not start. You can keep typing.');
    }
  }, [lang]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
  }, []);

  return { supported, listening, error, start, stop };
}

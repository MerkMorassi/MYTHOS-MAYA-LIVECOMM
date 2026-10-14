/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SonyTvHostView } from './components/SonyTvHostView';
import { IPhoneMicView } from './components/IPhoneMicView';
import { QRCodeModal } from './components/QRCodeModal';
import { WindowsSetupGuideModal } from './components/WindowsSetupGuideModal';
import { VoiceSettingsDrawer } from './components/VoiceSettingsDrawer';
import {
  AudioDeviceOption,
  DeviceInfo,
  IntercomConfig,
  IntercomMessage,
  IntercomTurnState,
  TranscriptItem,
  VoiceSettings,
} from './types';
import { getAudioDevices } from './utils/audioDevices';
import { getBrowserVoices, getDefaultBrowserVoice, VoiceOption, speakBrowserVoice, stopBrowserVoice } from './utils/speechEngine';
import { LiveVoiceClient } from './utils/webrtcClient';
import { fetchInternalAiResponse, playIntercomChime } from './utils/turnManager';

export default function App() {
  // Device Role Mode: 'host-tv' (Windows PC + SONY TV) or 'iphone-mic' (iPhone wireless transmitter)
  const [mode, setMode] = useState<'host-tv' | 'iphone-mic'>('host-tv');

  // Connected devices & connection metrics
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [latency, setLatency] = useState<number>(12);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('connecting');

  // Audio I/O devices
  const [audioInputs, setAudioInputs] = useState<AudioDeviceOption[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<AudioDeviceOption[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>('');
  const [selectedOutputId, setSelectedOutputId] = useState<string>('');

  // Transcripts list
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [iphoneBattery, setIphoneBattery] = useState<number>(1);
  const [iphoneCharging, setIphoneCharging] = useState<boolean>(false);

  // Browser Voice settings
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    voiceURI: '',
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    autoSpeakIncoming: false,
    vadEnabled: false,
  });

  // Intercom Turn-Taking Conversation State
  const [turnState, setTurnState] = useState<IntercomTurnState>('waiting_for_blackbox');
  const [activeSpeakerText, setActiveSpeakerText] = useState<string>('');
  const [intercomMessages, setIntercomMessages] = useState<IntercomMessage[]>([]);
  const [intercomConfig, setIntercomConfig] = useState<IntercomConfig>({
    autoTurnEnabled: true,
    silenceThresholdMs: 1600,
    intercomChirpEnabled: true,
    personaPrompt: '',
  });

  // Modals state
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isSetupGuideOpen, setIsSetupGuideOpen] = useState(false);
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false);

  // LiveVoiceClient ref & turn state refs
  const voiceClientRef = useRef<LiveVoiceClient | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedBlackBoxUtterance = useRef<string>('');
  const isInternalAiSpeakingRef = useRef<boolean>(false);
  const intercomMessagesRef = useRef<IntercomMessage[]>([]);
  intercomMessagesRef.current = intercomMessages;
  const intercomConfigRef = useRef<IntercomConfig>(intercomConfig);
  intercomConfigRef.current = intercomConfig;
  const voiceSettingsRef = useRef<VoiceSettings>(voiceSettings);
  voiceSettingsRef.current = voiceSettings;

  // Detect mode from URL search param or User-Agent on initial load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get('mode');
      if (modeParam === 'iphone') {
        setMode('iphone-mic');
      } else if (modeParam === 'tv') {
        setMode('host-tv');
      } else {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          setMode('iphone-mic');
        } else {
          setMode('host-tv');
        }
      }
    }
  }, []);

  // Enumerate Audio Devices & Browser Voices on mount
  useEffect(() => {
    getAudioDevices().then(({ inputs, outputs }) => {
      setAudioInputs(inputs);
      setAudioOutputs(outputs);

      const sonyOutput = outputs.find((o) =>
        o.label.toLowerCase().includes('sony') ||
        o.label.toLowerCase().includes('tv') ||
        o.label.toLowerCase().includes('hdmi')
      );
      if (sonyOutput) {
        setSelectedOutputId(sonyOutput.deviceId);
      }
    });

    getBrowserVoices().then((loadedVoices) => {
      setVoices(loadedVoices);
      const defaultVoice = getDefaultBrowserVoice() || loadedVoices.find((v) => v.isDefault) || loadedVoices[0];
      if (defaultVoice) {
        setVoiceSettings((prev) => ({
          ...prev,
          voiceURI: defaultVoice.voiceURI,
        }));
      }
    });
  }, []);

  /**
   * Triggers the Internal Local AI turn: evaluates conversation context and speaks aloud via Browser Voice
   */
  const triggerInternalAiTurn = useCallback(async (blackBoxText?: string) => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    const textToProcess = (blackBoxText || accumulatedBlackBoxUtterance.current || '').trim();
    if (!textToProcess && intercomMessagesRef.current.length === 0) {
      return;
    }

    // Play handover chime
    if (intercomConfigRef.current.intercomChirpEnabled) {
      playIntercomChime('turn_handover');
    }

    // Record Black Box message if newly provided
    if (textToProcess) {
      const blackBoxMsg: IntercomMessage = {
        id: 'bb_' + Date.now(),
        speaker: 'blackbox-iphone',
        text: textToProcess,
        timestamp: Date.now(),
      };
      setIntercomMessages((prev) => [...prev, blackBoxMsg]);
    }
    accumulatedBlackBoxUtterance.current = '';

    // Shift floor to Internal AI (thinking state)
    setTurnState('internal_thinking');
    setActiveSpeakerText('Thinking...');
    voiceClientRef.current?.sendTurnState('internal_thinking', 'Internal Local AI', 'Thinking...');

    try {
      // Call server-side Gemini API
      const responseText = await fetchInternalAiResponse(
        intercomMessagesRef.current,
        textToProcess,
        intercomConfigRef.current.personaPrompt
      );

      // Record Internal AI message
      const aiMsg: IntercomMessage = {
        id: 'ai_' + Date.now(),
        speaker: 'internal-ai',
        text: responseText,
        timestamp: Date.now(),
      };
      setIntercomMessages((prev) => [...prev, aiMsg]);

      // Shift floor to Internal AI (speaking state)
      setTurnState('internal_speaking');
      setActiveSpeakerText(responseText);
      isInternalAiSpeakingRef.current = true;
      voiceClientRef.current?.sendTurnState('internal_speaking', 'Internal Local AI', responseText);

      // Speak aloud through SONY TV speakers via Browser Voice
      setIsSpeaking(true);
      speakBrowserVoice(responseText, voiceSettingsRef.current, () => {
        isInternalAiSpeakingRef.current = false;
        setIsSpeaking(false);
        // Turn completed: yield floor back to Black Box AI
        if (intercomConfigRef.current.intercomChirpEnabled) {
          playIntercomChime('turn_handover');
        }
        setTurnState('waiting_for_blackbox');
        setActiveSpeakerText('');
        voiceClientRef.current?.sendTurnState('waiting_for_blackbox', 'Black Box AI');
      });
    } catch (err) {
      console.error('Turn execution error:', err);
      isInternalAiSpeakingRef.current = false;
      setTurnState('waiting_for_blackbox');
      voiceClientRef.current?.sendTurnState('waiting_for_blackbox', 'Black Box AI');
    }
  }, []);

  /**
   * Release floor immediately back to Black Box AI
   */
  const releaseTurnToBlackBox = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    stopBrowserVoice();
    isInternalAiSpeakingRef.current = false;
    accumulatedBlackBoxUtterance.current = '';
    setTurnState('waiting_for_blackbox');
    setActiveSpeakerText('');
    voiceClientRef.current?.sendTurnState('waiting_for_blackbox', 'Black Box AI');
  }, []);

  // Initialize WebRTC and WebSocket client whenever mode changes
  useEffect(() => {
    if (voiceClientRef.current) {
      voiceClientRef.current.destroy();
      voiceClientRef.current = null;
    }

    const clientName = mode === 'iphone-mic' ? 'iPhone Wireless Mic' : 'SONY TV Host Workstation';

    const client = new LiveVoiceClient({
      role: mode,
      deviceName: clientName,
      onStatusChange: (status) => setConnectionStatus(status),
      onDevicesUpdate: (updatedDevices) => setDevices(updatedDevices),
      onLatencyUpdate: (ms) => {
        setLatency(ms);
        setLatencyHistory((prev) => [...prev.slice(-59), ms]);
      },
      onTranscript: (item) => {
        setTranscripts((prev) => {
          const existingIndex = prev.findIndex((t) => t.id === item.id);
          if (existingIndex >= 0) {
            const next = [...prev];
            next[existingIndex] = item;
            return next;
          }
          return [...prev, item];
        });

        // Intercom Turn-Taking logic: Handle speech from Black Box (iPhone)
        if (item.role === 'iphone-mic' || item.senderName.toLowerCase().includes('iphone')) {
          // If the Internal AI was speaking, don't trigger unless floor is open
          if (isInternalAiSpeakingRef.current) {
            return;
          }

          setTurnState('blackbox_speaking');
          setActiveSpeakerText(item.text);
          accumulatedBlackBoxUtterance.current = item.text;

          // Clear existing silence timer
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }

          // If utterance segment finalized or auto turn enabled, arm silence handover timer
          if (intercomConfigRef.current.autoTurnEnabled && item.isFinal) {
            silenceTimerRef.current = setTimeout(() => {
              triggerInternalAiTurn(accumulatedBlackBoxUtterance.current);
            }, intercomConfigRef.current.silenceThresholdMs);
          }
        }
      },
      onTurnState: (incomingState, speaker, activeText) => {
        setTurnState(incomingState);
        if (activeText !== undefined) {
          setActiveSpeakerText(activeText);
        }
      },
      onIntercomTTS: (data) => {
        speakBrowserVoice(data.text, voiceSettingsRef.current);
      },
      onBatteryUpdate: (level, charging) => {
        setIphoneBattery(level);
        setIphoneCharging(Boolean(charging));
      },
    });

    voiceClientRef.current = client;
    client.connect();

    return () => {
      client.destroy();
      voiceClientRef.current = null;
    };
  }, [mode, triggerInternalAiTurn]);

  return (
    <div className="scroll">
      {mode === 'host-tv' ? (
        <SonyTvHostView
          devices={devices}
          latency={latency}
          connectionStatus={connectionStatus}
          voiceClient={voiceClientRef.current}
          transcripts={transcripts}
          onClearTranscripts={() => setTranscripts([])}
          voiceSettings={voiceSettings}
          onOpenVoiceSettings={() => setIsVoiceSettingsOpen(true)}
          onOpenQRCode={() => setIsQrOpen(true)}
          onOpenSetupGuide={() => setIsSetupGuideOpen(true)}
          audioInputs={audioInputs}
          audioOutputs={audioOutputs}
          selectedInputId={selectedInputId}
          selectedOutputId={selectedOutputId}
          onSelectInputId={setSelectedInputId}
          onSelectOutputId={setSelectedOutputId}
          turnState={turnState}
          activeSpeakerText={activeSpeakerText}
          intercomMessages={intercomMessages}
          intercomConfig={intercomConfig}
          onConfigChange={setIntercomConfig}
          onTriggerInternalAi={() => triggerInternalAiTurn()}
          onReleaseTurnToBlackBox={releaseTurnToBlackBox}
          onClearIntercomHistory={() => setIntercomMessages([])}
          isSpeaking={isSpeaking}
          latencyHistory={latencyHistory}
          iphoneBattery={iphoneBattery}
          iphoneCharging={iphoneCharging}
        />
      ) : (
        <IPhoneMicView
          devices={devices}
          latency={latency}
          connectionStatus={connectionStatus}
          voiceClient={voiceClientRef.current}
          transcripts={transcripts}
          onSwitchToTvMode={() => setMode('host-tv')}
          turnState={turnState}
          onYieldFloor={() => triggerInternalAiTurn()}
        />
      )}

      {/* MODALS */}
      <QRCodeModal isOpen={isQrOpen} onClose={() => setIsQrOpen(false)} />

      <WindowsSetupGuideModal
        isOpen={isSetupGuideOpen}
        onClose={() => setIsSetupGuideOpen(false)}
        selectedOutputId={selectedOutputId}
      />

      <VoiceSettingsDrawer
        isOpen={isVoiceSettingsOpen}
        onClose={() => setIsVoiceSettingsOpen(false)}
        settings={voiceSettings}
        onSettingsChange={setVoiceSettings}
        voices={voices}
      />
    </div>
  );
}

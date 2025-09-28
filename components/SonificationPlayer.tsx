"use client";

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Play, Pause, Download, FileVideo, Music } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface SonificationResult {
  success: boolean;
  audioUrl: string;
  videoAnalysis: any;
  musicalPlan: any;
  rawPlanBeforeGapFill?: any;
  gapFilledPlan?: any;
  message: string;
}

const SonificationPlayer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoAnalysis, setVideoAnalysis] = useState<any | null>(null);
  const [musicalPlan, setMusicalPlan] = useState<any | null>(null);
  const [videoDurationMs, setVideoDurationMs] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('video/')) {
        toast.error('Please select a valid video file');
        return;
      }

      // Validate file size (50MB limit)
      const maxSize = 50 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error('File size must be less than 50MB');
        return;
      }

      setSelectedFile(file);
      
      // Create preview URL for the video
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      
      // Reset previous results
      setAudioUrl(null);
      setIsAudioPlaying(false);
      setVideoAnalysis(null);
      setMusicalPlan(null);
      setVideoDurationMs(null);

      // Load metadata to obtain duration
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.onloadedmetadata = () => {
        if (tempVideo.duration && isFinite(tempVideo.duration)) {
          setVideoDurationMs(Math.round(tempVideo.duration * 1000));
          console.log('[client] Video duration ms:', Math.round(tempVideo.duration * 1000));
        }
        URL.revokeObjectURL(tempVideo.src);
      };
      tempVideo.src = URL.createObjectURL(file);
    }
  };

  const handleUploadAndSonify = async () => {
    if (!selectedFile) {
      toast.error('Select a video first');
      return;
    }

    const formData = new FormData();
    formData.append('video', selectedFile);
    if (videoDurationMs) {
      formData.append('durationMs', String(videoDurationMs));
    }

    setIsLoading(true);
    setLoadingStep('Uploading & analyzing video...');

    try {
      console.log('[client] Sending durationMs:', videoDurationMs);

      setLoadingStep('Analyzing video content...');
      
      const response = await fetch('/api/sonify', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process video');
      }

      setLoadingStep('Generating musical composition...');
      
  const result: SonificationResult & { videoAnalysis?: any; musicalPlan?: any } = await response.json();
      
      if (result.success) {
        setAudioUrl(result.audioUrl);
        setVideoAnalysis(result.videoAnalysis || null);
        setMusicalPlan({
          final: result.musicalPlan || null,
          rawBeforeGapFill: result.rawPlanBeforeGapFill || null,
          gapFilled: result.gapFilledPlan || null
        });
        toast.success(result.message);
      } else {
        throw new Error('Sonification failed');
      }
    } catch (error) {
      console.error('Error during sonification:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to process video');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const toggleAudioPlayback = () => {
    if (audioRef.current) {
      if (isAudioPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsAudioPlaying(!isAudioPlaying);
    }
  };

  const handleAudioEnded = () => {
    setIsAudioPlaying(false);
  };

  const downloadAudio = () => {
    if (audioUrl) {
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = `sonified-${selectedFile?.name || 'video'}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Sports Clip Sonification
        </h1>
        <p className="text-lg text-gray-600">
          Transform your sports videos into unique musical compositions using AI
        </p>
      </div>

      {/* File Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileVideo className="h-5 w-5" />
            Upload Video
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
            <label htmlFor="video-upload" className="block text-sm font-medium text-gray-700 mb-2 cursor-pointer">
              Select a video file
            </label>
            <input
              id="video-upload"
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
              style={{ margin: '0 auto 1rem auto', display: 'block', width: 'fit-content' }}
            />
          </div>
          <div className="mt-4 flex justify-center">
            <Button
              variant="default"
              className="w-40"
              onClick={handleUploadAndSonify}
            >
              {isLoading ? (loadingStep || 'Processing...') : 'Submit'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Video Preview */}
      {videoUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Video Preview {videoDurationMs ? `(~${Math.round(videoDurationMs/1000)}s)` : ''}</CardTitle>
          </CardHeader>
          <CardContent>
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className="w-full max-w-2xl mx-auto rounded-lg shadow-lg"
              style={{ maxHeight: '400px' }}
            >
              Your browser does not support the video tag.
            </video>
          </CardContent>
        </Card>
      )}

      {/* Debug Output: Video Analysis & Musical Plan */}
      {(videoAnalysis || musicalPlan) && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis & Musical Plan (Debug)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {videoAnalysis && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Video Analysis JSON</h3>
                <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded max-h-64 overflow-auto whitespace-pre-wrap break-all">
{JSON.stringify(videoAnalysis, null, 2)}
                </pre>
              </div>
            )}
            {musicalPlan && (
              <div className="space-y-4">
                {musicalPlan.rawBeforeGapFill && (
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Plan (Raw from Gemini before gap fill)</h3>
                    <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded max-h-60 overflow-auto whitespace-pre-wrap break-all">
{JSON.stringify(musicalPlan.rawBeforeGapFill, null, 2)}
                    </pre>
                  </div>
                )}
                {musicalPlan.gapFilled && (
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Plan After Median Gap Fill</h3>
                    <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded max-h-60 overflow-auto whitespace-pre-wrap break-all">
{JSON.stringify(musicalPlan.gapFilled, null, 2)}
                    </pre>
                  </div>
                )}
                {musicalPlan.final && (
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Final Plan (Post Scaling / Returned)</h3>
                    <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded max-h-60 overflow-auto whitespace-pre-wrap break-all">
{JSON.stringify(musicalPlan.final, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Audio Player */}
      {audioUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Generated Soundtrack
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              <Button
                onClick={toggleAudioPlayback}
                variant="outline"
                size="lg"
                className="flex items-center gap-2"
              >
                {isAudioPlaying ? (
                  <><Pause className="h-4 w-4" /> Pause</>
                ) : (
                  <><Play className="h-4 w-4" /> Play</>
                )}
              </Button>
              
              <Button
                onClick={downloadAudio}
                variant="outline"
                size="lg"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" /> Download
              </Button>
            </div>
            
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={handleAudioEnded}
              className="w-full"
              controls
            />
          </CardContent>
        </Card>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="text-lg font-medium">{loadingStep}</p>
              <p className="text-sm text-gray-500 text-center">
                This may take a few minutes depending on your video length
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SonificationPlayer;

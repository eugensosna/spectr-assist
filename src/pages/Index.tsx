import { useState, useEffect, useRef, useCallback } from "react";
import { ChatPanel, ChatPanelRef } from "@/components/ChatPanel";
import { FeatureEditor } from "@/components/FeatureEditor";
import { QualityPanel } from "@/components/QualityPanel";
import { AuthGuard } from "@/components/AuthGuard";
import { UserMenu } from "@/components/UserMenu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { MessageSquare, FileText, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import logo from "@/assets/logo.svg";

const Index = () => {
  const { user } = useAuth();
  const [featureContent, setFeatureContent] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "document" | "quality">("chat");
  const [hasDocumentUpdate, setHasDocumentUpdate] = useState(false);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [documentProgress, setDocumentProgress] = useState<{ visible: boolean; value: number }>({ visible: false, value: 0 });
  const [savedEstimation, setSavedEstimation] = useState<any>(null);
  const [startSignal, setStartSignal] = useState(0);
  const loadingChannelRef = useRef<any>(null);
  const chatPanelRef = useRef<ChatPanelRef>(null);
  const sessionId = useRef(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const isMobile = useIsMobile();
  const previousFeatureContent = useRef(featureContent);
  const featureContentRef = useRef(featureContent);
  const userRef = useRef(user);

  // Keep refs in sync with state
  useEffect(() => {
    featureContentRef.current = featureContent;
  }, [featureContent]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const startWaiting = useCallback(() => {
    // Kick off mobile progress immediately
    setDocumentProgress({ visible: true, value: 12 });
    setStartSignal((k) => k + 1);
    // Broadcast waiting-for-feature via parent-held channel
    try {
      loadingChannelRef.current?.send({ type: 'broadcast', event: 'waiting-for-feature', payload: { ts: Date.now(), sessionId: sessionId.current } });
    } catch {}
    const tempLoadingCh = supabase.channel(`loading-state-${sessionId.current}`, { config: { broadcast: { self: true }}});
    tempLoadingCh.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        tempLoadingCh.send({ type: 'broadcast', event: 'waiting-for-feature', payload: { ts: Date.now(), sessionId: sessionId.current } });
        setTimeout(() => supabase.removeChannel(tempLoadingCh), 500);
      }
    });
  }, [setDocumentProgress]);

  const handleSendMessage = (message: string) => {
    // Ensure waiting state starts even if ChatPanel channel isn't ready
    startWaiting();
    if (chatPanelRef.current) {
      chatPanelRef.current.sendMessage(message);
    }
  };

  const handleProgressChange = useCallback((visible: boolean, value: number) => {
    setDocumentProgress({ visible, value });
  }, []);

  // Track document updates for mobile badge
  useEffect(() => {
    if (isMobile && featureContent !== previousFeatureContent.current && activeTab !== "document" && featureContent !== "") {
      setHasDocumentUpdate(true);
    }
    previousFeatureContent.current = featureContent;
  }, [featureContent, activeTab, isMobile]);

  // Clear badge when switching to document tab
  useEffect(() => {
    if (activeTab === "document") {
      setHasDocumentUpdate(false);
    }
  }, [activeTab]);

  // Load last feature from user's most recent session
  useEffect(() => {
    const loadLastFeature = async () => {
      if (!user) {
        console.log('[FeatureLoad] No user available for loading feature');
        return;
      }

      console.log('[FeatureLoad] Loading last feature for user:', user.id);
      console.log('[FeatureLoad] Current feature content length:', featureContent.length);
      
      const { data, error } = await supabase
        .from('n8n_storymapper_feature_history')
        .select('feature_after, created_at, estimation, session_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[FeatureLoad] Error loading last feature:', error);
      } else if (data?.feature_after) {
        console.log('[FeatureLoad] Loaded feature from:', data.created_at);
        console.log('[FeatureLoad] Feature length:', data.feature_after.length);
        console.log('[FeatureLoad] Feature preview:', data.feature_after.substring(0, 100));
        setFeatureContent(data.feature_after);
        if (data.estimation) {
          console.log('[FeatureLoad] Loaded estimation:', data.estimation);
          setSavedEstimation(data.estimation);
        }
        console.log('[FeatureLoad] Feature content set successfully');
      } else {
        console.log('[FeatureLoad] No feature data found - leaving editor empty');
        setFeatureContent('');
        setSavedEstimation(null);
      }
    };

    loadLastFeature();
  }, [user]);

  // Save feature to database
  const saveFeatureToDb = async (featureBefore: string, featureAfter: string, userMessage: string, comment: string, estimation?: any) => {
    // Use ref to get current user, not stale closure value
    const currentUser = userRef.current;
    
    if (!currentUser?.id) {
      console.log('[FeatureSave] No user available, skipping save. User ref:', currentUser);
      return;
    }

    try {
      console.log('[FeatureSave] Saving feature to database for user:', currentUser.id);
      console.log('[FeatureSave] Feature before length:', featureBefore.length);
      console.log('[FeatureSave] Feature after length:', featureAfter.length);
      if (estimation) {
        console.log('[FeatureSave] Saving estimation data:', estimation);
      }
      
      const { error } = await supabase
        .from('n8n_storymapper_feature_history')
        .insert({
          user_id: currentUser.id,
          session_id: sessionId.current,
          feature_before: featureBefore,
          feature_after: featureAfter,
          user_message: userMessage,
          comment: comment,
          estimation: estimation || null,
        });

      if (error) {
        console.error('[FeatureSave] Error saving feature:', error);
      } else {
        console.log('[FeatureSave] Feature saved successfully to n8n_storymapper_feature_history');
      }
    } catch (error) {
      console.error('[FeatureSave] Unexpected error saving feature:', error);
    }
  };

  // Save estimation to database for the most recent feature entry
  const saveEstimationToDb = async (metrics: any) => {
    const currentUser = userRef.current;
    
    if (!currentUser?.id) {
      console.log('[EstimationSave] No user available, skipping save');
      return;
    }

    try {
      console.log('[EstimationSave] Saving estimation for session:', sessionId.current);
      console.log('[EstimationSave] Metrics:', metrics);
      
      // Update the most recent entry for this session with the estimation data
      const { error } = await supabase
        .from('n8n_storymapper_feature_history')
        .update({
          estimation: metrics
        })
        .eq('user_id', currentUser.id)
        .eq('session_id', sessionId.current)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('[EstimationSave] Error saving estimation:', error);
      } else {
        console.log('[EstimationSave] Estimation saved successfully');
      }
    } catch (error) {
      console.error('[EstimationSave] Unexpected error saving estimation:', error);
    }
  };

  useEffect(() => {
    const loadingCh = supabase.channel(`loading-state-${sessionId.current}`, { config: { broadcast: { self: true }}}).subscribe();
    loadingChannelRef.current = loadingCh;

    const featureCh = supabase
      .channel(`feature-updates-${sessionId.current}`)
      .on('broadcast', { event: 'feature-update' }, async (payload) => {
        console.log('Received feature update:', payload);
        if (payload.payload?.content || payload.payload?.text) {
          const newFeature = payload.payload.content || payload.payload.text;
          // Use ref to get current feature content, not stale closure value
          const previousFeature = featureContentRef.current;
          
          console.log('[FeatureUpdate] Previous feature length:', previousFeature.length);
          console.log('[FeatureUpdate] New feature length:', newFeature.length);
          
          // Update local state
          setFeatureContent(newFeature);
          
          // Save to database with current values from refs
          await saveFeatureToDb(
            previousFeature,
            newFeature,
            payload.payload.userMessage || '',
            payload.payload.comment || ''
          );
          
          // Notify Feature File that feature has been received to stop spinner and start QM spinner
           loadingChannelRef.current?.send({ type: 'broadcast', event: 'feature-received', payload: { ts: Date.now(), sessionId: sessionId.current } });
           loadingChannelRef.current?.send({ type: 'broadcast', event: 'waiting-for-metrics', payload: { ts: Date.now(), sessionId: sessionId.current } });

          // Fail-safe: also broadcast via a temporary channel to ensure delivery
          const tempLoadingCh = supabase.channel(`loading-state-${sessionId.current}`, { config: { broadcast: { self: true }}});
          tempLoadingCh.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
               tempLoadingCh.send({ type: 'broadcast', event: 'feature-received', payload: { ts: Date.now(), sessionId: sessionId.current } });
               tempLoadingCh.send({ type: 'broadcast', event: 'waiting-for-metrics', payload: { ts: Date.now(), sessionId: sessionId.current } });
              setTimeout(() => supabase.removeChannel(tempLoadingCh), 500);
            }
          });
        }
      })
      .subscribe();

    // Listen for quality metrics to get overall score
    const metricsChannel = supabase
      .channel(`quality-metrics-${sessionId.current}`)
      .on('broadcast', { event: 'metrics-update' }, async (payload) => {
        console.log('Index: Received metrics update:', payload);
        if (payload.payload?.overall !== undefined) {
          console.log('Index: Setting overall score:', payload.payload.overall);
          setOverallScore(payload.payload.overall);
          
          // Save estimation to database
          await saveEstimationToDb(payload.payload);
          
          // Broadcast metrics-received to stop the progress bar
          loadingChannelRef.current?.send({ type: 'broadcast', event: 'metrics-received', payload: { ts: Date.now(), sessionId: sessionId.current } });
        }
      })
      .subscribe((status) => {
        console.log('Index: Metrics channel subscription status:', status);
      });

    return () => {
      if (featureCh) supabase.removeChannel(featureCh);
      if (loadingCh) supabase.removeChannel(loadingCh);
      if (metricsChannel) supabase.removeChannel(metricsChannel);
    };
  }, []);

  return (
    <AuthGuard>
      <div className="h-screen bg-background flex flex-col">
          {/* Header */}
          <header className="bg-gradient-panel px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-4">
                <img src={logo} alt="BA Requirements Studio" className="h-8 sm:h-12" />
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block max-w-[360px]">Transform Natural Language Tasks into Structured Given-When-Then Statements</p>
              </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <div className="w-2 h-2 bg-estimate-low rounded-full"></div>
                  <span className="hidden sm:inline">Ready</span>
                </div>
                <UserMenu />
              </div>
            </div>
          </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden pb-16 lg:pb-0">
          {/* Mobile: Single Panel View */}
          {isMobile ? (
            <div className="flex-1 overflow-hidden">
              <div className={`h-full border-r ${activeTab === "chat" ? "block" : "hidden"}`} style={{ borderColor: 'rgba(0, 0, 0, 0.08)' }}>
                <ChatPanel 
                  ref={chatPanelRef}
                  featureContent={featureContent} 
                  onFeatureChange={setFeatureContent}
                  sessionId={sessionId.current}
                  onStartWaiting={startWaiting}
                />
              </div>
              
              <div className={`h-full p-4 ${activeTab === "document" ? "block" : "hidden"}`}>
                <FeatureEditor 
                  value={featureContent} 
                  onChange={setFeatureContent} 
                  sessionId={sessionId.current}
                  onProgressChange={handleProgressChange}
                  startSignal={startSignal}
                />
              </div>
              
              <div className={`h-full ${activeTab === "quality" ? "block" : "hidden"}`}>
                <QualityPanel 
                  featureContent={featureContent} 
                  sessionId={sessionId.current}
                  onSendMessage={handleSendMessage}
                  savedEstimation={savedEstimation}
                />
              </div>
            </div>
          ) : (
            /* Desktop: Three Column Layout - 30%, 40%, 30% */
            <div className="flex-1 flex overflow-hidden justify-center">
              {/* Left Panel - Chat (30% width, max 400px) */}
              <div className="w-[30%] max-w-[400px] flex-shrink-0 border-r" style={{ borderColor: 'rgba(0, 0, 0, 0.08)' }}>
                <ChatPanel 
                  ref={chatPanelRef}
                  featureContent={featureContent} 
                  onFeatureChange={setFeatureContent}
                  sessionId={sessionId.current}
                  onStartWaiting={startWaiting}
                />
              </div>

              {/* Center Panel - Feature Editor */}
              <div className="flex-1 min-w-0 p-6 flex flex-col">
                <div className="flex-1 min-h-0">
                  <FeatureEditor 
                    value={featureContent} 
                    onChange={setFeatureContent} 
                    sessionId={sessionId.current}
                    onProgressChange={handleProgressChange}
                    startSignal={startSignal}
                  />
                </div>
              </div>

              {/* Right Panel - Quality (30% width, max 400px) */}
              <div className="w-[30%] max-w-[400px] flex-shrink-0 flex flex-col overflow-hidden">
                <QualityPanel 
                  featureContent={featureContent} 
                  sessionId={sessionId.current}
                  onSendMessage={handleSendMessage}
                  savedEstimation={savedEstimation}
                />
              </div>
            </div>
          )}
        </div>

        {/* Mobile Bottom Tab Bar */}
        {isMobile && (
          <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50">
            <nav className="flex">
              <button
                id="mob-chat-tab-id"
                onClick={() => setActiveTab("chat")}
                className={`flex-1 flex flex-col items-center justify-center py-3 px-2 transition-colors ${
                  activeTab === "chat" 
                    ? "text-primary bg-accent" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageSquare className="h-5 w-5 mb-1" />
                <span className="text-xs font-medium">Chat</span>
              </button>
              
              <button
                id="mob-feature-tab-id"
                onClick={() => setActiveTab("document")}
                className={`flex-1 flex flex-col items-center justify-center py-3 px-2 transition-colors relative ${
                  activeTab === "document" 
                    ? "text-primary bg-accent" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="relative w-full flex flex-col items-center">
                  <div className="relative">
                    <FileText className="h-5 w-5 mb-1" />
                    {hasDocumentUpdate && (
                      <Badge className="absolute -top-1 -right-2 h-2 w-2 p-0 bg-primary" />
                    )}
                  </div>
                  <span className="text-xs font-medium mb-1">Document</span>
                  {documentProgress.visible && (
                    <div className="w-full px-2">
                      <div className="h-1 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${documentProgress.value}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </button>
              
              <button
                id="mob-quality-tab-id"
                onClick={() => setActiveTab("quality")}
                className={`flex-1 flex flex-col items-center justify-center py-3 px-2 transition-colors relative ${
                  activeTab === "quality" 
                    ? "text-primary bg-accent" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="relative">
                  <BarChart3 className="h-5 w-5 mb-1" />
                  {overallScore !== null && (
                    <Badge className="absolute -top-1 -right-3 h-4 px-1 text-[10px] bg-primary">
                      {overallScore}
                    </Badge>
                  )}
                </div>
                <span className="text-xs font-medium">Quality</span>
              </button>
            </nav>
          </div>
        )}
      </div>
    </AuthGuard>
  );
};

export default Index;

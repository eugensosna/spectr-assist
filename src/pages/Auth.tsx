import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import Logo from "@/assets/storybot_logo.svg";
const authSchema = z.object({
  email: z.string().trim().email({
    message: "Invalid email address"
  }),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters"
  })
});
export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  useEffect(() => {
    // Capture and save UTM parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const utmParams: Record<string, string> = {};
    const paramsToCapture = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid', 'landing_page'];
    paramsToCapture.forEach(param => {
      const value = urlParams.get(param);
      if (value) {
        utmParams[param] = value;
      }
    });

    // If landing_page is not set, use current page URL
    if (!utmParams.landing_page) {
      utmParams.landing_page = window.location.hostname;
    }
    if (Object.keys(utmParams).length > 0) {
      sessionStorage.setItem('utm_params', JSON.stringify(utmParams));
    }

    // Check if user is already authenticated
    const checkUser = async () => {
      const {
        data: {
          session
        }
      } = await supabase.auth.getSession();
      if (session) {
        navigate("/", { replace: true });
      }
    };
    checkUser();
  }, [navigate]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError(null);

      // Validate input
      const validation = authSchema.safeParse({
        email,
        password
      });
      if (!validation.success) {
        setError(validation.error.errors[0].message);
        return;
      }
      if (isSignUp) {
        const redirectUrl =  `${window.location.origin}/`;
        const {
          data,
          error
        } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl
          }
        });
        if (error) throw error;

        // Create lead in Bitrix24
        if (data?.user) {
          try {
            const utmParamsStr = sessionStorage.getItem('utm_params');
            const utmParams = utmParamsStr ? JSON.parse(utmParamsStr) : {};
            await supabase.functions.invoke('create-bitrix-lead', {
              body: {
                email: data.user.email,
                name: data.user.user_metadata?.full_name || data.user.user_metadata?.name,
                ...utmParams
              }
            });

            // Clear UTM params after use
            sessionStorage.removeItem('utm_params');
          } catch (bitrixError) {
            console.error('Failed to create CRM lead:', bitrixError);
            // Don't block registration if Bitrix24 fails
          }
        }
        toast({
          title: "Success!",
          description: "Please check your email to confirm your account."
        });
      } else {
        const {
          error
        } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      }
    } catch (err: any) {
      const message = err.message || 'An unexpected error occurred';
      setError(message);
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: message
      });
    } finally {
      setIsLoading(false);
    }
  };
  const signInWithGoogle = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl
        }
      });
      if (error) {
        setError(error.message);
        toast({
          variant: "destructive",
          title: "Authentication Error",
          description: error.message
        });
        setIsLoading(false);
      }
    } catch (err: any) {
      const message = err.message || 'An unexpected error occurred';
      setError(message);
      toast({
        variant: "destructive",
        title: "Error",
        description: message
      });
      setIsLoading(false);
    }
  };
  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-left pb-2 py-[34px]">
          <div className="flex justify-start mb-2 py-[16px]">
            <img src={Logo} alt="StoryBot Logo" className="w-[160px]" />
          </div>
          <CardTitle className="text-2xl font-bold py-0">
            {isSignUp ? "Create an account" : "Welcome back"}
          </CardTitle>
          <CardDescription className="pb-0 mb-0">
            {isSignUp ? "Sign up to access the StoryBot" : "Sign in to access the StoryBot"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>}
          
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} disabled={isLoading} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} disabled={isLoading} required />
            </div>
            <Button id="btn-email-auth" type="submit" disabled={isLoading} className="w-full" size="lg">
              {isLoading ? <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isSignUp ? "Signing up..." : "Signing in..."}
                </> : <>{isSignUp ? "Sign up" : "Sign in"}</>}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>
          
          <Button id="btn-google-auth" onClick={signInWithGoogle} disabled={isLoading} className="w-full" variant="outline" size="lg">
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google
          </Button>

          <div className="text-left">
            <button id="btn-toggle-auth-mode" type="button" onClick={() => {
            setIsSignUp(!isSignUp);
            setError(null);
          }} className="text-sm text-primary hover:underline" disabled={isLoading}>
              {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
          </div>

          <p id="legal-text" className="text-left text-sm text-muted-foreground">
            By continuing, you agree to our{" "}
            <a href="/TermsConditions.pdf" download="TermsConditions.pdf" className="text-primary hover:underline">
              terms of service
            </a>{" "}
            and{" "}
            <a href="/PrivacyPolicy.pdf" download="PrivacyPolicy.pdf" className="text-primary hover:underline">
              privacy policy
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>;
}
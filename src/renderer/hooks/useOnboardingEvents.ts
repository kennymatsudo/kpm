
interface UseOnboardingEventsResult {
  messages: string[];
  generatedContent: string | null;
  error: string | null;
  isGenerating: boolean;
  reset: () => void;
}


  const reset = useCallback(() => {
  }, []);

}

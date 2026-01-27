import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddressPrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface AddressDetails {
  address: string;
  city: string;
  postcode: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect: (details: AddressDetails) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = "Start typing an address...",
  disabled = false,
  className,
}: AddressAutocompleteProps) {
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionToken] = useState(() => crypto.randomUUID());
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Debounced search
  const searchPlaces = useCallback(async (input: string) => {
    if (input.trim().length < 3) {
      setPredictions([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('places-autocomplete', {
        body: { input, sessionToken },
      });

      if (error) throw error;
      setPredictions(data.predictions || []);
      setIsOpen(true);
    } catch (err) {
      console.error('Autocomplete error:', err);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchPlaces(newValue);
    }, 300);
  };

  // Handle prediction selection
  const handleSelect = async (prediction: AddressPrediction) => {
    setLoading(true);
    setIsOpen(false);
    setPredictions([]);

    try {
      const { data, error } = await supabase.functions.invoke('places-details', {
        body: { placeId: prediction.place_id, sessionToken },
      });

      if (error) throw error;

      onChange(data.address || prediction.structured_formatting.main_text);
      onAddressSelect({
        address: data.address || '',
        city: data.city || '',
        postcode: data.postcode || '',
      });
    } catch (err) {
      console.error('Details error:', err);
      onChange(prediction.structured_formatting.main_text);
    } finally {
      setLoading(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={handleInputChange}
          onFocus={() => predictions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("pr-10", className)}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <MapPin className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {isOpen && predictions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          <ul className="max-h-60 overflow-auto py-1">
            {predictions.map((prediction) => (
              <li
                key={prediction.place_id}
                onClick={() => handleSelect(prediction)}
                className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-accent"
              >
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {prediction.structured_formatting.main_text}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {prediction.structured_formatting.secondary_text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-3 py-1.5">
            <p className="text-[10px] text-muted-foreground">Powered by Google</p>
          </div>
        </div>
      )}
    </div>
  );
}

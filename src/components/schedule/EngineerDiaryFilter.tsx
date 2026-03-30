import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Users } from "lucide-react";

interface EngineerDiaryFilterProps {
  selectedEngineerId: string | null;
  onEngineerChange: (engineerId: string | null) => void;
}

export function EngineerDiaryFilter({ selectedEngineerId, onEngineerChange }: EngineerDiaryFilterProps) {
  const { data: engineers = [] } = useQuery({
    queryKey: ['engineers-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedEngineerId || "all"}
        onValueChange={(val) => onEngineerChange(val === "all" ? null : val)}
      >
        <SelectTrigger className="w-[200px] h-9">
          <div className="flex items-center gap-2">
            {selectedEngineerId ? (
              <User className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <SelectValue placeholder="All Engineers" />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <span className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              All Engineers
            </span>
          </SelectItem>
          {engineers.map((eng) => (
            <SelectItem key={eng.user_id} value={eng.user_id}>
              <span className="flex items-center gap-2">
                <User className="h-3.5 w-3.5" />
                {eng.full_name || eng.email || 'Unknown'}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

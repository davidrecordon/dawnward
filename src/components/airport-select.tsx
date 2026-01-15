"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plane } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Airport } from "@/types/airport";
import { loadAirports, searchAirports } from "@/lib/airport-search";

interface AirportSelectProps {
  value: Airport | null;
  onSelect: (airport: Airport) => void;
  placeholder?: string;
  hasError?: boolean;
}

export function AirportSelect({
  value,
  onSelect,
  placeholder = "Select airport...",
  hasError = false,
}: AirportSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [airports, setAirports] = React.useState<Airport[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filteredAirports, setFilteredAirports] = React.useState<Airport[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Load airports on mount
  React.useEffect(() => {
    loadAirports()
      .then((data) => {
        setAirports(data);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Failed to load airports:", error);
        setIsLoading(false);
      });
  }, []);

  // Filter airports when search query changes (non-urgent update)
  React.useEffect(() => {
    if (searchQuery.length >= 2) {
      // Use startTransition to keep input responsive during search
      searchAirports(searchQuery, airports, 10).then((results) => {
        React.startTransition(() => {
          setFilteredAirports(results);
        });
      });
    } else {
      // Show popular airports when no search query
      React.startTransition(() => {
        const popular = airports.filter((a) =>
          [
            "JFK",
            "LAX",
            "SFO",
            "LHR",
            "CDG",
            "NRT",
            "SIN",
            "DXB",
            "HKG",
            "SYD",
          ].includes(a.code)
        );
        setFilteredAirports(popular);
      });
    }
  }, [searchQuery, airports]);

  const handleSelect = (airport: Airport) => {
    onSelect(airport);
    setOpen(false);
    setSearchQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between bg-white font-normal",
            hasError && "border-[#F4A574] ring-[3px] ring-[#F4A574]/20"
          )}
        >
          {value ? (
            <span className="flex items-center gap-2 truncate">
              <span className="font-medium">{value.code}</span>
              <span className="text-muted-foreground truncate">
                {value.city}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search airports..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {isLoading ? (
              <div className="text-muted-foreground py-6 text-center text-sm">
                Loading airports...
              </div>
            ) : filteredAirports.length === 0 ? (
              <CommandEmpty>
                {searchQuery.length < 2
                  ? "Type to search airports..."
                  : "No airports found."}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredAirports.map((airport) => (
                  <CommandItem
                    key={airport.code}
                    value={airport.code}
                    onSelect={() => handleSelect(airport)}
                    className="cursor-pointer"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Plane className="h-4 w-4 shrink-0 -rotate-45 text-sky-500" />
                      <span className="font-medium">{airport.code}</span>
                      <span className="text-muted-foreground truncate">
                        {airport.city}, {airport.country}
                      </span>
                    </div>
                    {value?.code === airport.code && (
                      <Check className="h-4 w-4 shrink-0" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

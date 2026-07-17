"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function DateRangePicker({
  className,
  date,
  setDate,
  trigger,
}: {
  className?: string;
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const [tempDate, setTempDate] = React.useState<DateRange | undefined>(date);

  // Sync tempDate with date when it opens
  React.useEffect(() => {
    if (open) {
      setTempDate(date);
    }
  }, [open, date]);

  const handleApply = () => {
    setDate(tempDate);
    setOpen(false);
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={trigger ? trigger : (
            <Button
              id="date"
              variant={"outline"}
              className={cn(
                "w-[260px] justify-start text-left font-normal rounded-full bg-white/80 backdrop-blur-md border-border/60 hover:bg-white transition-colors",
                !date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, "LLL dd, y")} -{" "}
                    {format(date.to, "LLL dd, y")}
                  </>
                ) : (
                  format(date.from, "LLL dd, y")
                )
              ) : (
                <span>Pick a date range</span>
              )}
            </Button>
          )}
        />
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            defaultMonth={tempDate?.from || new Date()}
            selected={tempDate}
            onSelect={setTempDate}
            numberOfMonths={1}
          />
          <div className="flex justify-end p-3 border-t border-border bg-muted/20">
            <Button onClick={handleApply} size="sm">
              Apply Date
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

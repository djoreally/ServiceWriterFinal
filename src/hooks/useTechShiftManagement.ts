/**
 * Tech Shift Management Hook — Enterprise shift operations
 * 
 * Handles all shift-related state and operations:
 * - Clock in/out with location tracking
 * - Break management
 * - Performance tracking
 * - Compliance monitoring
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { useRealTimeTechStatus } from './useRealTimeTechStatus';

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface ShiftData {
  id: string;
  clock_in: string;
  clock_out: string | null;
  status: 'active' | 'on_break' | 'completed';
  break_duration_minutes: number | null;
  total_hours: number | null;
  regular_hours: number | null;
  overtime_hours: number | null;
}

export interface ShiftMetrics {
  hours_today: number;
  jobs_completed: number;
  jobs_remaining: number;
  efficiency_score: number;
  break_time_used: number;
}

export function useTechShiftManagement(technician_id?: string) {
  const [shift, setShift] = useState<ShiftData | null>(null);
  const [metrics, setMetrics] = useState<ShiftMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const { 
    handleClockIn, 
    handleClockOut, 
    handleStartBreak, 
    handleEndBreak,
    state: techState 
  } = useRealTimeTechStatus(technician_id);

  // ⚡ Live time ticker for shift duration
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000); // 30s updates
    return () => clearInterval(interval);
  }, []);

  const fetchShiftData = useCallback(async () => {
    if (!technician_id) return;

    const { data: { user } } = await getCurrentAuthUser();
    if (!user) return;

    const today = format(new Date(), 'yyyy-MM-dd');

    const [shiftRes, jobsRes, completedRes] = await Promise.all([
      // Current active shift
      supabase
        .from('time_clock_entries')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['active', 'on_break'])
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle(),
      
      // Today's job metrics
      supabase
        .from('appointments')
        .select('id, dispatch_status, estimated_duration_minutes', { count: 'exact' })
        .eq('assigned_technician_id', technician_id)
        .eq('scheduled_date', today)
        .not('dispatch_status', 'eq', 'cancelled'),

      // Completed jobs today
      supabase
        .from('appointments')
        .select('id', { count: 'exact' })
        .eq('assigned_technician_id', technician_id)
        .eq('scheduled_date', today)
        .eq('dispatch_status', 'completed'),
    ]);

    setShift(shiftRes.data as ShiftData | null);

    // Calculate metrics
    const totalJobs = jobsRes.count || 0;
    const completedJobs = completedRes.count || 0;
    const remainingJobs = totalJobs - completedJobs;

    let hoursToday = 0;
    if (shiftRes.data && shiftRes.data.status !== 'completed') {
      const shiftMinutes = differenceInMinutes(now, parseISO(shiftRes.data.clock_in));
      const breakMinutes = shiftRes.data.break_duration_minutes || 0;
      hoursToday = (shiftMinutes - breakMinutes) / 60;
    } else if (shiftRes.data?.total_hours) {
      hoursToday = shiftRes.data.total_hours;
    }

    // Efficiency: jobs completed per hour
    const efficiencyScore = hoursToday > 0 ? (completedJobs / hoursToday) * 100 : 0;

    setMetrics({
      hours_today: hoursToday,
      jobs_completed: completedJobs,
      jobs_remaining: remainingJobs,
      efficiency_score: Math.round(efficiencyScore),
      break_time_used: (shiftRes.data?.break_duration_minutes || 0) / 60,
    });

    setLoading(false);
  }, [technician_id, now]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchShiftData());
  }, [fetchShiftData]);

  // ⚡ Enterprise shift transition methods
  const clockIn = async () => {
    try {
      const location = await getCurrentLocation();
      await handleClockIn(location);
      await fetchShiftData();
    } catch (err) {
      await handleClockIn(); // Fallback without location
      await fetchShiftData();
    }
  };

  const clockOut = async () => {
    try {
      const location = await getCurrentLocation();
      await handleClockOut(location);
      await fetchShiftData();
    } catch (err) {
      await handleClockOut(); // Fallback without location
      await fetchShiftData();
    }
  };

  const startBreak = async () => {
    await handleStartBreak();
    await fetchShiftData();
  };

  const endBreak = async () => {
    await handleEndBreak();
    await fetchShiftData();
  };

  const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
        reject,
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  // Calculate live shift duration
  const shiftDuration = shift && shift.status !== 'completed'
    ? differenceInMinutes(now, parseISO(shift.clock_in)) - (shift.break_duration_minutes || 0)
    : shift?.total_hours ? shift.total_hours * 60 : 0;

  const shiftHours = Math.floor(shiftDuration / 60);
  const shiftMinutes = shiftDuration % 60;

  return {
    shift,
    metrics,
    loading,
    techState,
    // Live shift display
    shiftHours,
    shiftMinutes,
    shiftDuration,
    // Enterprise shift operations
    clockIn,
    clockOut,
    startBreak,
    endBreak,
    refetch: fetchShiftData,
  };
}
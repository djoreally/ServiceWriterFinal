/**
 * Tech Shift Management Hook — Enterprise shift operations
 *
 * Canonical appointment metrics use assigned_user_id + starts_at + status.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInMinutes, parseISO, startOfDay, endOfDay } from 'date-fns';
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
    state: techState,
  } = useRealTimeTechStatus(technician_id);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchShiftData = useCallback(async () => {
    if (!technician_id) return;

    const { data: { user } } = await getCurrentAuthUser();
    if (!user) return;

    const dayStart = startOfDay(new Date()).toISOString();
    const dayEnd = endOfDay(new Date()).toISOString();
    const appointments = supabase as any;

    const [shiftRes, jobsRes, completedRes] = await Promise.all([
      supabase
        .from('time_clock_entries')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['active', 'on_break'])
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle(),
      appointments
        .from('appointments')
        .select('id,status,starts_at,ends_at,metadata', { count: 'exact' })
        .eq('assigned_user_id', user.id)
        .gte('starts_at', dayStart)
        .lte('starts_at', dayEnd)
        .neq('status', 'cancelled'),
      appointments
        .from('appointments')
        .select('id', { count: 'exact' })
        .eq('assigned_user_id', user.id)
        .gte('starts_at', dayStart)
        .lte('starts_at', dayEnd)
        .eq('status', 'completed'),
    ]);

    if (shiftRes.error) throw shiftRes.error;
    if (jobsRes.error) throw jobsRes.error;
    if (completedRes.error) throw completedRes.error;

    setShift(shiftRes.data as ShiftData | null);

    const totalJobs = jobsRes.count || 0;
    const completedJobs = completedRes.count || 0;
    const remainingJobs = Math.max(0, totalJobs - completedJobs);

    let hoursToday = 0;
    if (shiftRes.data && shiftRes.data.status !== 'completed') {
      const shiftMinutes = differenceInMinutes(now, parseISO(shiftRes.data.clock_in));
      const breakMinutes = shiftRes.data.break_duration_minutes || 0;
      hoursToday = Math.max(0, (shiftMinutes - breakMinutes) / 60);
    } else if (shiftRes.data?.total_hours) {
      hoursToday = shiftRes.data.total_hours;
    }

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

  const clockIn = async () => {
    try {
      const location = await getCurrentLocation();
      await handleClockIn(location);
      await fetchShiftData();
    } catch {
      await handleClockIn();
      await fetchShiftData();
    }
  };

  const clockOut = async () => {
    try {
      const location = await getCurrentLocation();
      await handleClockOut(location);
      await fetchShiftData();
    } catch {
      await handleClockOut();
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
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        reject,
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  };

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
    shiftHours,
    shiftMinutes,
    shiftDuration,
    clockIn,
    clockOut,
    startBreak,
    endBreak,
    refetch: fetchShiftData,
  };
}

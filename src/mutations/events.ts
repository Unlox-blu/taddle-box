
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryKeys';
import { eventService } from '../services/event.service';
import { themedAlert } from '../components/common/ThemedAlert';

export function useToggleEventRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, isCurrentlyRegistered }: { eventId: string; isCurrentlyRegistered: boolean }) => {
      // In current taddle, registration is a single toggle-like flow or just register/cancel.
      if (isCurrentlyRegistered) {
        await eventService.cancelRegistration(eventId);
      } else {
        await eventService.register(eventId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
    },
    onError: (err: any) => {
      // e.g. insufficient XP for a paid event — surface it so the user knows
      // why registration didn't go through.
      themedAlert('Registration Failed', err?.response?.data?.message || err?.message || 'Could not register for this event.');
    },
  });
}

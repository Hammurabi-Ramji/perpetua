import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export function useLicenses() {
  const queryClient = useQueryClient();

  const licensesQuery = useQuery({ 
    queryKey: ['licenses'], 
    queryFn: () => api.get('/licenses').then(r => r.data) 
  });

  const statsQuery = useQuery({ 
    queryKey: ['license-stats'], 
    queryFn: () => api.get('/licenses/stats').then(r => r.data) 
  });

  const expiringQuery = useQuery({ 
    queryKey: ['expiring-licenses'], 
    queryFn: () => api.get('/licenses?action_required=true').then(r => r.data) 
  });

  const updateActionMutation = useMutation({
    mutationFn: ({ id, actionData }) => api.patch(`/licenses/${id}/action`, actionData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      queryClient.invalidateQueries({ queryKey: ['expiring-licenses'] });
    }
  });

  const completeActionMutation = useMutation({
    mutationFn: (id) => api.patch(`/licenses/${id}/action/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      queryClient.invalidateQueries({ queryKey: ['expiring-licenses'] });
    }
  });

  const addLicenseMutation = useMutation({
    mutationFn: (licenseData) => api.post('/licenses', licenseData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      queryClient.invalidateQueries({ queryKey: ['license-stats'] });
    }
  });

  return {
    licenses: licensesQuery.data,
    stats: statsQuery.data,
    expiring: expiringQuery.data,
    isLoading: licensesQuery.isLoading || statsQuery.isLoading,
    updateAction: updateActionMutation.mutate,
    completeAction: completeActionMutation.mutate,
    addLicense: addLicenseMutation.mutate,
    isAddingLicense: addLicenseMutation.isPending
  };
}

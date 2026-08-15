import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { todosApi, type UserTodo } from '@/api/todos';

const KEY = ['todos'] as const;

export function useTodos() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: todosApi.list,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY });

  const create = useMutation({
    mutationFn: todosApi.create,
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & { text?: string; completed?: boolean; reminder_at?: string | null }) =>
      todosApi.update(id, body),
    onMutate: async (vars) => {
      if (vars.completed === undefined) return;
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData<UserTodo[]>(KEY);
      queryClient.setQueryData<UserTodo[]>(KEY, (old) =>
        (old || []).map((t) => (t.id === vars.id ? { ...t, completed: vars.completed as boolean } : t))
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(KEY, ctx.previous);
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: todosApi.remove,
    onSuccess: invalidate,
  });

  const todos = query.data || [];
  const pending = todos.filter((t) => !t.completed);
  const completed = todos.filter((t) => t.completed);

  return { ...query, todos, pending, completed, create, update, remove };
}

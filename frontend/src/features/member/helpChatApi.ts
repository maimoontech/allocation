import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

export type HelpChatAnswer = {
  id: number;
  reply: string;
  topic: string | null;
  /** False when nothing in the knowledge base matched, so the reply is the "I can help with" list. */
  answered: boolean;
};

export type HelpChatRow = {
  id: number;
  member_account_id: number;
  its_no: string;
  member_name: string | null;
  question: string;
  agent_reply: string;
  topic: string | null;
  star_rating: number | null;
  created_at: string;
};

export type HelpChatPage = {
  items: HelpChatRow[];
  total: number;
  average_rating: number | null;
  unanswered: number;
  page: number;
  page_size: number;
};

export const helpChatApi = api.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Ask the agent. The answer comes from the server, where the knowledge base lives
     * beside the rules it restates, and the exchange is stored as it is answered.
     */
    askHelpChat: builder.mutation<HelpChatAnswer, { question: string }>({
      query: (body) => ({ url: "/members/me/help-chats", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<HelpChatAnswer>) => res.data,
      invalidatesTags: [{ type: "HelpChats", id: "LIST" }]
    }),

    rateHelpChat: builder.mutation<
      { id: number; star_rating: number },
      { id: number; star_rating: number }
    >({
      query: ({ id, star_rating }) => ({
        url: `/members/me/help-chats/${id}`,
        method: "PATCH",
        body: { star_rating }
      }),
      transformResponse: (res: ApiEnvelope<{ id: number; star_rating: number }>) => res.data,
      invalidatesTags: [{ type: "HelpChats", id: "LIST" }]
    }),

    /** Admin → Help Chats. */
    getHelpChats: builder.query<HelpChatPage, { page?: number; rated?: string } | void>({
      query: (arg) => {
        const params = new URLSearchParams();
        if (arg?.page) params.set("page", String(arg.page));
        if (arg?.rated && arg.rated !== "all") params.set("rated", arg.rated);
        const qs = params.toString();
        return qs ? `/help-chats?${qs}` : "/help-chats";
      },
      transformResponse: (res: ApiEnvelope<HelpChatPage>) => res.data,
      providesTags: [{ type: "HelpChats", id: "LIST" }]
    })
  })
});

export const {
  useAskHelpChatMutation,
  useRateHelpChatMutation,
  useGetHelpChatsQuery
} = helpChatApi;

/**
 * Supabase Client Initialization & Helper Wrapper
 * OSIS Candra Kirana SPENASIX Divisi 9
 */

let sbClient = null;

function getSupabaseClient() {
    if (!sbClient) {
        if (typeof supabase === 'undefined') {
            console.error('Supabase SDK not loaded via CDN!');
            return null;
        }
        sbClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true
            }
        });
    }
    return sbClient;
}

/**
 * Execute a Supabase RPC procedure
 * @param {string} functionName 
 * @param {object} params 
 */
async function callRpc(functionName, params = {}) {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase client is not configured.');

    const { data, error } = await client.rpc(functionName, params);
    if (error) {
        console.error(`RPC Error [${functionName}]:`, error);
        throw error;
    }
    return data;
}

/**
 * Helper to subscribe to Supabase Realtime changes
 * @param {string} channelName 
 * @param {string} table 
 * @param {function} callback 
 */
function subscribeToRealtimeTable(channelName, table, callback) {
    const client = getSupabaseClient();
    if (!client) return null;

    const channel = client
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: table }, (payload) => {
            callback(payload);
        })
        .subscribe();

    return channel;
}

package com.winstone.connect.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

/**
 * Remembers who this phone belongs to.
 *
 * The agent signs in once; everything the phone posts afterwards carries the
 * employee id, so the CRM can attribute every call recording, WhatsApp log and
 * presence beacon to the right person.
 *
 * DataStore reads are asynchronous, which is a problem on a cold start caused
 * by an incoming call: the phone-state receiver runs before the in-memory
 * fields are populated. So every write is mirrored into SharedPreferences,
 * which can be read synchronously from a BroadcastReceiver or a Worker.
 */
private val Context.sessionStore by preferencesDataStore("winstone_session")

object AgentSession {
    private val EMPLOYEE_ID = stringPreferencesKey("employee_id")
    private val AGENT_ID = stringPreferencesKey("agent_id")
    private val AGENT_NAME = stringPreferencesKey("agent_name")

    private const val MIRROR = "winstone_session_mirror"
    private const val M_EMPLOYEE = "employee_id"
    private const val M_AGENT = "agent_id"
    private const val M_NAME = "agent_name"

    @Volatile var employeeId: String? = null; private set
    @Volatile var agentId: String? = null; private set
    @Volatile var agentName: String? = null; private set

    private fun mirror(context: Context) =
        context.applicationContext.getSharedPreferences(MIRROR, Context.MODE_PRIVATE)

    /**
     * Synchronous, cold-start-safe employee id. Use this from BroadcastReceivers
     * and Workers instead of the in-memory field.
     */
    fun employeeIdNow(context: Context): String? =
        employeeId ?: mirror(context).getString(M_EMPLOYEE, null)?.also { employeeId = it }

    /** Synchronous, cold-start-safe CRM profile id (may legitimately be null). */
    fun agentIdNow(context: Context): String? =
        agentId ?: mirror(context).getString(M_AGENT, null)?.also { agentId = it }

    fun agentNameNow(context: Context): String? =
        agentName ?: mirror(context).getString(M_NAME, null)?.also { agentName = it }

    /** Call once from Application.onCreate (inside a coroutine). */
    suspend fun load(context: Context) {
        // Mirror first: instant, so a call arriving during startup is covered.
        val m = mirror(context)
        employeeId = m.getString(M_EMPLOYEE, null)
        agentId = m.getString(M_AGENT, null)
        agentName = m.getString(M_NAME, null)

        val prefs = context.sessionStore.data.first()
        prefs[EMPLOYEE_ID]?.let { employeeId = it }
        prefs[AGENT_ID]?.let { agentId = it }
        prefs[AGENT_NAME]?.let { agentName = it }
        m.edit()
            .putString(M_EMPLOYEE, employeeId)
            .putString(M_AGENT, agentId)
            .putString(M_NAME, agentName)
            .apply()
    }

    suspend fun saveEmployeeId(context: Context, id: String) {
        val clean = id.trim().uppercase()
        employeeId = clean
        mirror(context).edit().putString(M_EMPLOYEE, clean).commit()
        context.sessionStore.edit { it[EMPLOYEE_ID] = clean }
    }

    /** Called after every successful workspace fetch. */
    suspend fun cacheAgent(context: Context, id: String, name: String) {
        agentId = id
        agentName = name
        mirror(context).edit().putString(M_AGENT, id).putString(M_NAME, name).commit()
        context.sessionStore.edit {
            it[AGENT_ID] = id
            it[AGENT_NAME] = name
        }
    }

    fun isSignedIn(): Boolean = !employeeId.isNullOrBlank()

    suspend fun clear(context: Context) {
        employeeId = null; agentId = null; agentName = null
        mirror(context).edit().clear().commit()
        context.sessionStore.edit { it.clear() }
    }
}

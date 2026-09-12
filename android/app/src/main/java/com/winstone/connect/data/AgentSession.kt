package com.winstone.connect.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

/**
 * Remembers who this phone belongs to.
 *
 * The agent types their employee id (WIN2601..WIN2606) once on first launch;
 * everything the phone posts afterwards carries it, so the CRM can attribute
 * every call recording, WhatsApp log and presence beacon to the right person.
 */
private val Context.sessionStore by preferencesDataStore("winstone_session")

object AgentSession {
    private val EMPLOYEE_ID = stringPreferencesKey("employee_id")
    private val AGENT_ID = stringPreferencesKey("agent_id")
    private val AGENT_NAME = stringPreferencesKey("agent_name")

    @Volatile var employeeId: String? = null; private set
    @Volatile var agentId: String? = null; private set
    @Volatile var agentName: String? = null; private set

    /** Call once from Application.onCreate (inside a coroutine). */
    suspend fun load(context: Context) {
        val prefs = context.sessionStore.data.first()
        employeeId = prefs[EMPLOYEE_ID]
        agentId = prefs[AGENT_ID]
        agentName = prefs[AGENT_NAME]
    }

    suspend fun saveEmployeeId(context: Context, id: String) {
        val clean = id.trim().uppercase()
        employeeId = clean
        context.sessionStore.edit { it[EMPLOYEE_ID] = clean }
    }

    /** Called after every successful workspace fetch. */
    suspend fun cacheAgent(context: Context, id: String, name: String) {
        agentId = id
        agentName = name
        context.sessionStore.edit {
            it[AGENT_ID] = id
            it[AGENT_NAME] = name
        }
    }

    fun isSignedIn(): Boolean = !employeeId.isNullOrBlank()

    suspend fun clear(context: Context) {
        employeeId = null; agentId = null; agentName = null
        context.sessionStore.edit { it.clear() }
    }
}

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
    private val DEVICE_TOKEN = stringPreferencesKey("device_token")
    private val DEVICE_ID = stringPreferencesKey("device_id")
    private val SIM_NUMBER = stringPreferencesKey("sim_number")

    private const val MIRROR = "winstone_session_mirror"
    private const val M_EMPLOYEE = "employee_id"
    private const val M_AGENT = "agent_id"
    private const val M_NAME = "agent_name"
    private const val M_DEVICE_TOKEN = "device_token"
    private const val M_DEVICE_ID = "device_id"
    private const val M_SIM = "sim_number"

    @Volatile var employeeId: String? = null; private set
    @Volatile var agentId: String? = null; private set
    @Volatile var agentName: String? = null; private set

    /**
     * Per-device token issued by the CRM at sign-in. This replaces the old
     * shared ingest secret that used to be compiled into the APK: the token is
     * bound to this one agent profile and can be revoked from the IT Console.
     */
    @Volatile var deviceToken: String? = null; private set
    @Volatile var deviceId: String? = null; private set

    /** SIM number this agent signed in with; posted with the capability beacon. */
    @Volatile var simNumber: String? = null; private set

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

    /** Synchronous, cold-start-safe device token for Workers and receivers. */
    fun deviceTokenNow(context: Context): String? =
        deviceToken ?: mirror(context).getString(M_DEVICE_TOKEN, null)?.also { deviceToken = it }

    fun deviceIdNow(context: Context): String? =
        deviceId ?: mirror(context).getString(M_DEVICE_ID, null)?.also { deviceId = it }

    fun simNumberNow(context: Context): String? =
        simNumber ?: mirror(context).getString(M_SIM, null)?.also { simNumber = it }

    fun agentNameNow(context: Context): String? =
        agentName ?: mirror(context).getString(M_NAME, null)?.also { agentName = it }

    /** Call once from Application.onCreate (inside a coroutine). */
    suspend fun load(context: Context) {
        // Mirror first: instant, so a call arriving during startup is covered.
        val m = mirror(context)
        employeeId = m.getString(M_EMPLOYEE, null)
        agentId = m.getString(M_AGENT, null)
        agentName = m.getString(M_NAME, null)
        deviceToken = m.getString(M_DEVICE_TOKEN, null)
        deviceId = m.getString(M_DEVICE_ID, null)
        simNumber = m.getString(M_SIM, null)

        val prefs = context.sessionStore.data.first()
        prefs[EMPLOYEE_ID]?.let { employeeId = it }
        prefs[AGENT_ID]?.let { agentId = it }
        prefs[AGENT_NAME]?.let { agentName = it }
        prefs[DEVICE_TOKEN]?.let { deviceToken = it }
        prefs[DEVICE_ID]?.let { deviceId = it }
        prefs[SIM_NUMBER]?.let { simNumber = it }
        m.edit()
            .putString(M_EMPLOYEE, employeeId)
            .putString(M_AGENT, agentId)
            .putString(M_NAME, agentName)
            .putString(M_DEVICE_TOKEN, deviceToken)
            .putString(M_DEVICE_ID, deviceId)
            .putString(M_SIM, simNumber)
            .apply()
    }

    suspend fun saveEmployeeId(context: Context, id: String) {
        val clean = id.trim().uppercase()
        employeeId = clean
        mirror(context).edit().putString(M_EMPLOYEE, clean).commit()
        context.sessionStore.edit { it[EMPLOYEE_ID] = clean }
    }

    /** Stores the SIM number the agent signed in with. */
    suspend fun saveSim(context: Context, sim: String) {
        val clean = sim.trim()
        simNumber = clean
        mirror(context).edit().putString(M_SIM, clean).commit()
        context.sessionStore.edit { it[SIM_NUMBER] = clean }
    }

    /** Stores the device token the CRM issued for this phone. */
    suspend fun saveDevice(context: Context, token: String, id: String) {
        deviceToken = token
        deviceId = id
        mirror(context).edit().putString(M_DEVICE_TOKEN, token).putString(M_DEVICE_ID, id).commit()
        context.sessionStore.edit {
            it[DEVICE_TOKEN] = token
            it[DEVICE_ID] = id
        }
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
        employeeId = null; agentId = null; agentName = null; deviceToken = null; deviceId = null; simNumber = null
        mirror(context).edit().clear().commit()
        context.sessionStore.edit { it.clear() }
    }
}

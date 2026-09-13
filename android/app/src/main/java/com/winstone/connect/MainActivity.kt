package com.winstone.connect

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.app.ActivityCompat
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.winstone.connect.telephony.CallPhase
import com.winstone.connect.telephony.LiveCallLauncher
import com.winstone.connect.ui.DeskScreen
import com.winstone.connect.ui.LiveCallScreen
import com.winstone.connect.ui.DeskViewModel
import com.winstone.connect.ui.SignInScreen
import com.winstone.connect.ui.collectAsStateSafe
import com.winstone.connect.ui.theme.WinstoneTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestCallPermissions()

        setContent {
            WinstoneTheme {
                val vm: DeskViewModel = viewModel { DeskViewModel(application) }
                val state by vm.state.collectAsStateSafe()
                val phase by LiveCallLauncher.phase.collectAsStateSafe()

                // Mandatory post-call report gate: even if the app was closed
                // after the call, the report opens itself on the next launch
                // and no new call is possible before it is submitted.
                var pendingReport by remember { mutableStateOf(false) }
                LaunchedEffect(phase, state.employeeId) {
                    if (phase == CallPhase.Idle && !state.employeeId.isNullOrBlank()) {
                        val body = runCatching {
                            com.winstone.connect.data.remote.WinstoneApi.pendingReport()
                        }.getOrNull()
                        pendingReport = body?.optJSONObject("pending") != null
                    }
                }

                if (phase != CallPhase.Idle) {
                    LiveCallScreen(phase = phase)
                } else if (state.employeeId.isNullOrBlank()) {
                    SignInScreen(
                        error = state.error,
                        loading = state.loading,
                        onSignIn = vm::signIn,
                    )
                } else {
                    DeskScreen(
                        activity = this,
                        vm = vm,
                        reportPending = pendingReport,
                        onReportSubmitted = { pendingReport = false },
                    )
                }
            }
        }
    }

    private fun requestCallPermissions() {
        val wanted = mutableListOf(
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_CALL_LOG,
        )
        if (Build.VERSION.SDK_INT >= 28) wanted += Manifest.permission.ANSWER_PHONE_CALLS
        if (Build.VERSION.SDK_INT >= 33) wanted += Manifest.permission.POST_NOTIFICATIONS
        ActivityCompat.requestPermissions(this, wanted.toTypedArray(), 9001)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LiveCallLauncher.REQ_CALL && grantResults.isNotEmpty()
            && grantResults[0] == PackageManager.PERMISSION_GRANTED
        ) {
            LiveCallLauncher.retryPendingCall(this)
        }
    }
}

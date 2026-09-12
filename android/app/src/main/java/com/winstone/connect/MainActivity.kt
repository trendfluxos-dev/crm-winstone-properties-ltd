package com.winstone.connect

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.app.ActivityCompat
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.winstone.connect.ui.DeskScreen
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
                if (state.employeeId.isNullOrBlank()) {
                    SignInScreen(error = state.error, onSignIn = vm::signIn)
                } else {
                    DeskScreen(activity = this, vm = vm)
                }
            }
        }
    }

    private fun requestCallPermissions() {
        val wanted = mutableListOf(
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.RECORD_AUDIO,
        )
        if (Build.VERSION.SDK_INT >= 33) wanted += Manifest.permission.POST_NOTIFICATIONS
        ActivityCompat.requestPermissions(this, wanted.toTypedArray(), 9001)
    }
}

package com.winstone.connect.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.winstone.connect.ui.theme.WinInkMuted

/**
 * Phone number + password only. No email field, no employee id typing.
 */
@Composable
fun SignInScreen(
    error: String?,
    loading: Boolean = false,
    onSignIn: (String, String) -> Unit,
) {
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val digits = phone.filter { it.isDigit() }
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Winstone Connect", fontWeight = FontWeight.Bold, fontSize = 24.sp)
        Text(
            "আপনার ফোন নম্বর ও পাসওয়ার্ড দিয়ে প্রবেশ করুন — এরপর আপনার লিড ও কল সব এখানেই দেখাবে।",
            color = WinInkMuted,
            fontSize = 13.sp,
            modifier = Modifier.padding(vertical = 12.dp),
        )
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text("ফোন নম্বর") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("পাসওয়ার্ড") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
        )
        error?.let {
            Text(
                it,
                color = androidx.compose.material3.MaterialTheme.colorScheme.error,
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        Button(
            onClick = { onSignIn(phone, password) },
            enabled = !loading && digits.length >= 6 && password.length >= 6,
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        ) {
            if (loading) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
            Text("প্রবেশ করুন")
        }
    }
}

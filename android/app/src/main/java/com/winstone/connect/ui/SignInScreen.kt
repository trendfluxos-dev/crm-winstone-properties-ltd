package com.winstone.connect.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.winstone.connect.ui.theme.WinInkMuted

@Composable
fun SignInScreen(error: String?, onSignIn: (String) -> Unit) {
    var id by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Winstone Connect", fontWeight = FontWeight.Bold, fontSize = 24.sp)
        Text(
            "আপনার এজেন্ট আইডি দিন — এরপর আপনার লিড, কল আর WhatsApp সব এখানেই দেখাবে।",
            color = WinInkMuted,
            fontSize = 13.sp,
            modifier = Modifier.padding(vertical = 12.dp),
        )
        OutlinedTextField(
            value = id,
            onValueChange = { id = it },
            label = { Text("এজেন্ট আইডি (যেমন WIN2601)") },
            modifier = Modifier.fillMaxWidth(),
        )
        error?.let { Text(it, color = androidx.compose.material3.MaterialTheme.colorScheme.error, fontSize = 12.sp) }
        Button(
            onClick = { onSignIn(id) },
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        ) { Text("প্রবেশ করুন") }
    }
}

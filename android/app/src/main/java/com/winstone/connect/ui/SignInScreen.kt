package com.winstone.connect.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.winstone.connect.ui.theme.WinBorder
import com.winstone.connect.ui.theme.WinGold
import com.winstone.connect.ui.theme.WinGoldSoft
import com.winstone.connect.ui.theme.WinInk
import com.winstone.connect.ui.theme.WinInkSecondary
import com.winstone.connect.ui.theme.WinError
import com.winstone.connect.ui.theme.WinWhite

/**
 * Phone number + password only. No email field, no employee id typing.
 * Visual only — the sign-in contract is unchanged.
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
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedContainerColor = WinWhite,
        unfocusedContainerColor = WinWhite,
        focusedBorderColor = WinGold,
        unfocusedBorderColor = WinBorder,
        focusedTextColor = WinInk,
        unfocusedTextColor = WinInk,
        cursorColor = WinGold,
        focusedLabelColor = WinInkSecondary,
        unfocusedLabelColor = WinInkSecondary,
    )
    Column(
        Modifier
            .fillMaxSize()
            .background(WinWhite)
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(horizontal = 24.dp, vertical = 40.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(56.dp)
                .background(WinGoldSoft, RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text("W", color = WinGold, fontWeight = FontWeight.Bold, fontSize = 26.sp)
        }
        Spacer(Modifier.height(20.dp))
        Text(
            "Winstone Connect",
            color = WinInk,
            fontWeight = FontWeight.Bold,
            fontSize = 28.sp,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "TELE-SALES OPERATING SYSTEM",
            color = WinGold,
            fontWeight = FontWeight.SemiBold,
            fontSize = 12.sp,
        )
        Spacer(Modifier.height(18.dp))
        Text(
            "আপনার ফোন নম্বর ও পাসওয়ার্ড দিয়ে প্রবেশ করুন — এরপর আপনার লিড ও কল সব এখানেই দেখাবে।",
            color = WinInkSecondary,
            fontSize = 15.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(bottom = 24.dp),
        )
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text("ফোন নম্বর", fontSize = 14.sp) },
            singleLine = true,
            textStyle = TextStyle(fontSize = 16.sp),
            colors = fieldColors,
            shape = RoundedCornerShape(12.dp),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth().height(60.dp),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("পাসওয়ার্ড", fontSize = 14.sp) },
            singleLine = true,
            textStyle = TextStyle(fontSize = 16.sp),
            colors = fieldColors,
            shape = RoundedCornerShape(12.dp),
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth().height(60.dp),
        )
        error?.let {
            Text(
                it,
                color = WinError,
                fontSize = 14.sp,
                modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
            )
        }
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { onSignIn(phone, password) },
            enabled = !loading && digits.length >= 6 && password.length >= 6,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            }
            Text("প্রবেশ করুন", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

package com.winstone.connect.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import kotlinx.coroutines.flow.StateFlow

/** Small alias so the desk screen reads cleanly. */
@Composable
fun <T> StateFlow<T>.collectAsStateSafe(): State<T> = collectAsState()

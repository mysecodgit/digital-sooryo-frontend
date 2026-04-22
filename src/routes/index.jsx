import React from "react";
import { Navigate } from "react-router-dom";

// // Profile
import UserProfile from "../pages/Authentication/user-profile";

// // Authentication related pages
import Login from "../pages/Authentication/Login";
import Logout from "../pages/Authentication/Logout";
import Register from "../pages/Authentication/Register";
import ForgetPwd from "../pages/Authentication/ForgetPassword";
import Claim from "../pages/Claim";

// // Dashboard
import Dashboard from "../pages/Dashboard/index";
import Vendors from "../pages/Vendors";
import Customers from "../pages/Customers";
import Weddings from "../pages/Weddings";
import QrCodes from "../pages/QrCodes";
import Claims from "../pages/Claims";

const authProtectedRoutes = [
  { path: "/dashboard", component: <Dashboard /> },

  //profile
  { path: "/profile", component: <UserProfile /> },
  { path: "/vendors", component: <Vendors /> },
  { path: "/customers", component: <Customers /> },
  { path: "/qr-codes", component: <QrCodes /> },
  { path: "/claims", component: <Claims /> },
  { path: "/weddings", component: <Weddings /> },

  // this route should be at the end of all other routes
  // eslint-disable-next-line react/display-name
  { path: "/", exact: true, component: <Navigate to="/dashboard" /> },
];

const publicRoutes = [
  { path: "/claim", component: <Claim /> },
  { path: "/logout", component: <Logout /> },
  { path: "/login", component: <Login /> },
  { path: "/forgot-password", component: <ForgetPwd /> },
  { path: "/register", component: <Register /> },
];

export { authProtectedRoutes, publicRoutes };
